// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract FileRegistry {
    struct Record {
        string cid;
        string pinHash;
        string salt;
        string iv;
        string orgId;
        bool revoked;
    }

    address public owner;
    mapping(address => bool) public orgs;
    mapping(bytes32 => Record) private records;

    event RecordStored(bytes32 indexed id, string orgId, address indexed by);
    event RecordRevoked(bytes32 indexed id);
    event OrgApproved(address indexed org);
    event OrgRevoked(address indexed org);

    constructor() {
        owner = msg.sender;
        orgs[msg.sender] = true;
    }

    modifier onlyApproved() {
        require(orgs[msg.sender], "Not approved");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function approveOrg(address org) external onlyOwner {
        orgs[org] = true;
        emit OrgApproved(org);
    }

    function revokeOrg(address org) external onlyOwner {
        orgs[org] = false;
        emit OrgRevoked(org);
    }

    function store(
        bytes32 id,
        string calldata cid,
        string calldata pinHash,
        string calldata salt,
        string calldata iv,
        string calldata orgId
    ) external onlyApproved {
        require(bytes(records[id].cid).length == 0, "ID already exists");
        records[id] = Record(cid, pinHash, salt, iv, orgId, false);
        emit RecordStored(id, orgId, msg.sender);
    }

    function revokeRecord(bytes32 id) external onlyOwner {
        require(bytes(records[id].cid).length != 0, "Record not found");
        records[id].revoked = true;
        emit RecordRevoked(id);
    }

    function get(bytes32 id) external view returns (Record memory) {
        require(bytes(records[id].cid).length != 0, "Record not found");
        require(!records[id].revoked, "Record revoked");
        return records[id];
    }
}
