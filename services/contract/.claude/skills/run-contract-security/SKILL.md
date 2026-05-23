---
name: run-contract-security
description: Smart contract vulnerability testing for FileRegistry.sol — find, exploit, and fix Solidity security issues using Foundry forge test with vm.prank, vm.expectRevert, and attack simulation patterns
---

# Contract Security Testing

Vulnerability workflow for `services/contract/FileRegistry.sol` using Foundry.
The pattern: write an exploit test that **passes** to prove a bug exists, apply
the fix, confirm the exploit test **fails** and all existing tests still pass.

All commands run from `services/contract/`. Foundry is at
`/home/nanoclaw/.foundry/bin/` — prefix `PATH` or add to shell.

## Prerequisites

```bash
# Foundry (one-time install)
curl -L https://foundry.paradigm.xyz | bash
/home/nanoclaw/.foundry/bin/foundryup

# forge-std (already installed as a submodule)
# If lib/forge-std is missing:
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge install foundry-rs/forge-std
```

## Run the exploit suite

```bash
# Run only exploit/attack tests
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge test \
  --match-path test/FileRegistryExploits.t.sol -vv

# Run everything — exploits + regression tests
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge test -vv
```

Expected output after fixes are applied:
- `test/FileRegistry.t.sol` — **25 passed, 0 failed** (regression suite)
- `test/FileRegistryExploits.t.sol` — **1 passed, 3 failed** (exploits blocked by fixes)

A failing exploit test means the vulnerability has been patched.
A passing exploit test means the vulnerability is still open.

## Vulnerability workflow

### 1 — Write an attack scenario

Add a test to `test/FileRegistryExploits.t.sol`. Structure:

```solidity
function test_exploit_<Name>() public {
    // Set up precondition (legitimate state)
    registry.updateRoot("victim", keccak256("real"), "cid", 1);

    // Approve attacker, simulate their address
    registry.approveOrg(attacker);
    vm.prank(attacker);

    // The attack
    registry.updateRoot("victim", bytes32(0), "", 0);

    // Assert the damage — test PASSES = bug confirmed
    assertEq(registry.currentRoot("victim"), bytes32(0));
}
```

Key Foundry cheatcodes for attack simulation:

| Cheatcode | Use |
|-----------|-----|
| `vm.prank(addr)` | Next call comes from `addr` |
| `vm.startPrank(addr)` / `vm.stopPrank()` | All calls in block come from `addr` |
| `vm.expectRevert("msg")` | Assert next call reverts with that message |
| `vm.expectRevert()` | Assert next call reverts with any message |
| `vm.warp(ts)` | Set `block.timestamp` |
| `vm.roll(n)` | Set `block.number` |
| `makeAddr("label")` | Deterministic address from a label string |

### 2 — Confirm the exploit passes (bug is real)

```bash
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge test \
  --match-test test_exploit_<Name> -vv
```

Output should be `[PASS]`. If it fails, the contract already defends against it.

### 3 — Apply the fix to `FileRegistry.sol`

Edit the contract. Common fix patterns:

- **Access binding**: store `mapping(string => address) public orgOwner` — first
  writer claims an orgId, later calls require `orgOwner[orgId] == msg.sender`.
- **Guard self-revoke**: `require(org != owner, "Cannot revoke owner")` in `revokeOrg`.
- **Bounds check**: `require(index < array.length, "Index out of bounds")` before array access.
- **Zero-address check**: `require(org != address(0))` in `approveOrg`.

### 4 — Confirm exploit is blocked, regressions still pass

```bash
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge test -vv
```

The exploit test should now be `[FAIL: <your revert message>]`.
`test/FileRegistry.t.sol` must remain 25/25.

## Vulnerabilities found and fixed (2026-05-23)

### CRITICAL — Cross-org root poisoning (`test_exploit_CrossOrgPoisoning`)

**Bug**: `updateRoot(orgId, ...)` had no binding between the caller's address and
the `orgId` string. Any approved org could overwrite any other org's Merkle root,
destroying on-chain evidence.

**Fix** (`FileRegistry.sol`):
```solidity
mapping(string => address) public orgOwner;

// in updateRoot():
address existing = orgOwner[orgId];
if (existing == address(0)) {
    orgOwner[orgId] = msg.sender;   // first write claims the orgId
} else {
    require(existing == msg.sender, "Not org owner");
}
```

### HIGH — Checkpoint flood via cross-org write (`test_exploit_CheckpointFlood`)

**Bug**: Same root cause as above — a poisoning attacker could also spam the
checkpoint array of any orgId, polluting history and making iteration expensive.

**Fix**: Same orgId ownership mapping above blocks this.

### MEDIUM — Owner self-revocation footgun (`test_exploit_OwnerSelfRevocation`)

**Bug**: `revokeOrg(owner)` silently removed the owner from the approved set.
The owner could still manage approvals but could no longer call `updateRoot`
until they re-approved themselves — a silent pipeline breakage.

**Fix**:
```solidity
function revokeOrg(address org) external onlyOwner {
    require(org != owner, "Cannot revoke owner");
    ...
}
```

### LOW — OOB checkpoint access panics without context (`test_exploit_OOBCheckpointPanic`)

**Bug**: `getCheckpoint(orgId, index)` with an out-of-bounds index reverted with
a bare Solidity `Panic(0x32)` — no message. Dashboards and indexers got an
opaque error.

**Fix**:
```solidity
require(index < orgCheckpoints[orgId].length, "Index out of bounds");
```

## Adding new vulnerability classes to investigate

When reviewing a new version of the contract, check these categories:

| Class | What to look for |
|-------|-----------------|
| Access control | Can caller A affect data owned by caller B? |
| Reentrancy | Any external call before state updates? |
| Integer over/underflow | Arithmetic on untrusted input (less common post-0.8) |
| Timestamp dependence | `block.timestamp` used for security decisions? |
| Unbounded arrays | Can an attacker grow any array indefinitely? |
| Zero-address / zero-value | Are zero inputs validated before storage? |
| Ownership transfer | Is there a `transferOwnership` path if a key is lost? |
| Event spoofing | Can events be emitted with misleading data? |

## Gotchas

- **Exploit tests must PASS before the fix** — if you write the test after the fix
  and it immediately fails, you haven't proven the vulnerability was real. Always
  test against the unfixed contract first.
- **forge-std `makeAddr` addresses have no ETH** — if your exploit needs to send
  value, add `vm.deal(attacker, 1 ether)` in `setUp`.
- **`vm.expectRevert` must immediately precede the reverting call** — any other
  call between them resets the expectation.
- **`forge test` runs each test in isolation with a fresh EVM state** — `setUp()`
  runs before every test; no shared state between tests unless using storage
  variables in the test contract.
- **`--match-path` uses a substring match** — `--match-path Exploits` matches
  `test/FileRegistryExploits.t.sol`.
