// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../FileRegistry.sol";

contract FileRegistryTest is Test {
    FileRegistry internal registry;

    // Forge-std makeAddr gives deterministic addresses
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    function setUp() public {
        registry = new FileRegistry();
    }

    // ── Ownership & access ────────────────────────────────────────────────────

    function test_OwnerIsDeployer() public view {
        assertEq(registry.owner(), address(this));
    }

    function test_DeployerIsApproved() public view {
        assertTrue(registry.orgs(address(this)));
    }

    function test_ApproveOrg() public {
        assertFalse(registry.orgs(alice));
        registry.approveOrg(alice);
        assertTrue(registry.orgs(alice));
    }

    function test_ApproveOrg_Unauthorized() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        registry.approveOrg(bob);
    }

    function test_RevokeOrg() public {
        registry.approveOrg(alice);
        registry.revokeOrg(alice);
        assertFalse(registry.orgs(alice));
    }

    function test_RevokeOrg_Unauthorized() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        registry.revokeOrg(address(this));
    }

    // ── updateRoot ────────────────────────────────────────────────────────────

    function test_UpdateRoot() public {
        bytes32 root = keccak256("root1");
        registry.updateRoot("org1", root, "ipfs://meta1", 5);
        assertEq(registry.currentRoot("org1"), root);
    }

    function test_UpdateRoot_Unauthorized() public {
        vm.prank(alice);
        vm.expectRevert("Not approved");
        registry.updateRoot("org1", keccak256("x"), "cid", 0);
    }

    function test_UpdateRoot_ApprovedOrg() public {
        registry.approveOrg(alice);
        vm.prank(alice);
        registry.updateRoot("org1", keccak256("root"), "ipfs://cid", 3);
        assertEq(registry.currentRoot("org1"), keccak256("root"));
    }

    function test_UpdateRoot_MultipleOrgs() public {
        bytes32 root1 = keccak256("org1root");
        bytes32 root2 = keccak256("org2root");
        registry.updateRoot("org1", root1, "cid1", 1);
        registry.updateRoot("org2", root2, "cid2", 2);
        assertEq(registry.currentRoot("org1"), root1);
        assertEq(registry.currentRoot("org2"), root2);
    }

    function test_UpdateRoot_Overwrites() public {
        registry.updateRoot("org1", keccak256("old"), "cid_old", 1);
        bytes32 newRoot = keccak256("new");
        registry.updateRoot("org1", newRoot, "cid_new", 2);
        assertEq(registry.currentRoot("org1"), newRoot);
    }

    function test_RevokedOrg_CannotUpdateRoot() public {
        registry.approveOrg(alice);
        registry.revokeOrg(alice);
        vm.prank(alice);
        vm.expectRevert("Not approved");
        registry.updateRoot("org1", keccak256("x"), "cid", 0);
    }

    // ── Checkpoints ───────────────────────────────────────────────────────────

    function test_CheckpointCount() public {
        assertEq(registry.getCheckpointCount("org1"), 0);
        registry.updateRoot("org1", keccak256("r1"), "c1", 1);
        assertEq(registry.getCheckpointCount("org1"), 1);
        registry.updateRoot("org1", keccak256("r2"), "c2", 2);
        assertEq(registry.getCheckpointCount("org1"), 2);
    }

    function test_GetCheckpoint() public {
        bytes32 root = keccak256("root");
        uint256 before = block.timestamp;
        registry.updateRoot("org1", root, "ipfs://meta", 7);

        FileRegistry.Checkpoint memory cp = registry.getCheckpoint("org1", 0);
        assertEq(cp.root, root);
        assertEq(cp.metaCID, "ipfs://meta");
        assertEq(cp.assetCount, 7);
        assertGe(cp.timestamp, before);
    }

    function test_GetLatestCheckpoint() public {
        registry.updateRoot("org1", keccak256("r1"), "c1", 1);
        registry.updateRoot("org1", keccak256("r2"), "c2", 2);

        FileRegistry.Checkpoint memory cp = registry.getLatestCheckpoint("org1");
        assertEq(cp.root, keccak256("r2"));
        assertEq(cp.metaCID, "c2");
        assertEq(cp.assetCount, 2);
    }

    function test_GetLatestCheckpoint_Empty() public {
        vm.expectRevert("No checkpoints");
        registry.getLatestCheckpoint("no-such-org");
    }

    // ── Merkle verify (contract uses keccak256) ────────────────────────────────

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b
            ? keccak256(abi.encodePacked(a, b))
            : keccak256(abi.encodePacked(b, a));
    }

    function test_Verify_SingleLeaf() public {
        bytes32 leaf = keccak256("leaf");
        // Single leaf: root == leaf, empty proof
        registry.updateRoot("org1", leaf, "cid", 1);
        bytes32[] memory proof = new bytes32[](0);
        assertTrue(registry.verify("org1", leaf, proof));
    }

    function test_Verify_2Leaf_LeftLeaf() public {
        bytes32 A = keccak256("A");
        bytes32 B = keccak256("B");
        bytes32 root = _hashPair(A, B);
        registry.updateRoot("org1", root, "cid", 2);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = B;
        assertTrue(registry.verify("org1", A, proof));
    }

    function test_Verify_2Leaf_RightLeaf() public {
        bytes32 A = keccak256("A");
        bytes32 B = keccak256("B");
        bytes32 root = _hashPair(A, B);
        registry.updateRoot("org1", root, "cid", 2);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = A;
        assertTrue(registry.verify("org1", B, proof));
    }

    function test_Verify_3Leaf() public {
        bytes32 A = keccak256("A");
        bytes32 B = keccak256("B");
        bytes32 C = keccak256("C");
        bytes32 AB = _hashPair(A, B);
        bytes32 CC = _hashPair(C, C); // duplicate last leaf
        bytes32 root = _hashPair(AB, CC);
        registry.updateRoot("org1", root, "cid", 3);

        // Proof for A
        bytes32[] memory proofA = new bytes32[](2);
        proofA[0] = B;
        proofA[1] = CC;
        assertTrue(registry.verify("org1", A, proofA));

        // Proof for C (its own duplicate is its sibling)
        bytes32[] memory proofC = new bytes32[](2);
        proofC[0] = C;
        proofC[1] = AB;
        assertTrue(registry.verify("org1", C, proofC));
    }

    function test_Verify_WrongLeaf() public {
        bytes32 A = keccak256("A");
        bytes32 B = keccak256("B");
        bytes32 root = _hashPair(A, B);
        registry.updateRoot("org1", root, "cid", 2);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = B;
        // Wrong leaf (C instead of A)
        assertFalse(registry.verify("org1", keccak256("C"), proof));
    }

    function test_Verify_WrongOrg() public {
        bytes32 leaf = keccak256("leaf");
        registry.updateRoot("org1", leaf, "cid", 1);

        bytes32[] memory proof = new bytes32[](0);
        // "org2" has no root (zero bytes32), leaf won't match
        assertFalse(registry.verify("org2", leaf, proof));
    }

    // ── Events ────────────────────────────────────────────────────────────────

    function test_RootUpdated_Event() public {
        bytes32 root = keccak256("root");
        vm.expectEmit(true, false, false, true);
        emit FileRegistry.RootUpdated("org1", root, "cid", 4, block.timestamp);
        registry.updateRoot("org1", root, "cid", 4);
    }

    function test_OrgApproved_Event() public {
        vm.expectEmit(true, false, false, false);
        emit FileRegistry.OrgApproved(alice);
        registry.approveOrg(alice);
    }

    function test_OrgRevoked_Event() public {
        registry.approveOrg(alice);
        vm.expectEmit(true, false, false, false);
        emit FileRegistry.OrgRevoked(alice);
        registry.revokeOrg(alice);
    }
}
