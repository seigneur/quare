// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library MerkleProof {
  function verify(
    bytes32[] memory proof,
    bytes32 root,
    bytes32 leaf
  ) internal pure returns (bool) {
    bytes32 computed = leaf;
    for (uint256 i = 0; i < proof.length; i++) {
      bytes32 sibling = proof[i];
      computed = computed <= sibling
        ? keccak256(abi.encodePacked(computed, sibling))
        : keccak256(abi.encodePacked(sibling, computed));
    }
    return computed == root;
  }
}

contract FileRegistry {
  using MerkleProof for bytes32[];

  struct Checkpoint {
    bytes32 root;
    string metaCID;
    uint256 timestamp;
    uint256 assetCount;
  }

  address public owner;
  mapping(address => bool) public orgs;

  // First approved address to write an orgId claims permanent ownership of it.
  // Subsequent updateRoot calls for that orgId are restricted to that address.
  mapping(string => address) public orgOwner;

  mapping(string => Checkpoint[]) private orgCheckpoints;
  mapping(string => bytes32) public currentRoot;

  event OrgApproved(address indexed org);
  event OrgRevoked(address indexed org);
  event RootUpdated(
    string indexed orgId,
    bytes32 root,
    string metaCID,
    uint256 assetCount,
    uint256 timestamp
  );

  constructor() {
    owner = msg.sender;
    orgs[msg.sender] = true;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "Not owner");
    _;
  }

  modifier onlyApproved() {
    require(orgs[msg.sender], "Not approved");
    _;
  }

  function approveOrg(address org) external onlyOwner {
    orgs[org] = true;
    emit OrgApproved(org);
  }

  function revokeOrg(address org) external onlyOwner {
    require(org != owner, "Cannot revoke owner");
    orgs[org] = false;
    emit OrgRevoked(org);
  }

  function updateRoot(
    string calldata orgId,
    bytes32 newRoot,
    string calldata metaCID,
    uint256 assetCount
  ) external onlyApproved {
    address existing = orgOwner[orgId];
    if (existing == address(0)) {
      orgOwner[orgId] = msg.sender;
    } else {
      require(existing == msg.sender, "Not org owner");
    }
    currentRoot[orgId] = newRoot;
    orgCheckpoints[orgId].push(Checkpoint({
      root: newRoot,
      metaCID: metaCID,
      timestamp: block.timestamp,
      assetCount: assetCount
    }));
    emit RootUpdated(orgId, newRoot, metaCID, assetCount, block.timestamp);
  }

  function verify(
    string calldata orgId,
    bytes32 leaf,
    bytes32[] calldata proof
  ) external view returns (bool) {
    return proof.verify(currentRoot[orgId], leaf);
  }

  function getCheckpointCount(string calldata orgId)
    external view returns (uint256) {
    return orgCheckpoints[orgId].length;
  }

  function getCheckpoint(string calldata orgId, uint256 index)
    external view returns (Checkpoint memory) {
    require(index < orgCheckpoints[orgId].length, "Index out of bounds");
    return orgCheckpoints[orgId][index];
  }

  function getLatestCheckpoint(string calldata orgId)
    external view returns (Checkpoint memory) {
    uint256 len = orgCheckpoints[orgId].length;
    require(len > 0, "No checkpoints");
    return orgCheckpoints[orgId][len - 1];
  }
}
