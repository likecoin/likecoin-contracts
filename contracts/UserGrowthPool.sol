pragma solidity ^0.4.15;

import "./LikeCoin.sol";

contract UserGrowthPool {
    LikeCoin like;
    address[] public owners;
    uint8 public threshold;
    uint public mintTime;
    uint256 public mintValue;

    // returns a number which is a power of 2, so we can use uint256 and bitwise operations to simulate a set
    mapping (address => uint256) ownerIndex;

    // avoid using 0 as fields in proposals are by default initialized to 0
    uint64 minApprovedId = 1;
    uint64 nextId = 1;

    struct Proposal {
        uint64 id;
        address proposer;
        uint8 confirmNeeded;
        uint256 confirmedTable;
    }
    event ProposalConfirmation(uint64 indexed _id, address _confirmer);
    event ProposalExecution(uint64 indexed _id, address _executer);

    struct TransferInfo {
        uint64 id;
        address to;
        uint256 value;
    }
    event TransferProposal(uint64 indexed _id, address _proposer, address _to, uint256 _value);

    struct SetOwnersInfo {
        uint64 id;
        address[] newOwners;
        uint8 newThreshold;
    }
    event SetOwnersProposal(uint64 indexed _id, address _proposer, address[] _newOwners, uint8 _newThreshold);

    mapping (uint64 => Proposal) proposals;
    mapping (uint64 => TransferInfo) transferInfo;
    mapping (uint64 => SetOwnersInfo) setOwnersInfo;

    function UserGrowthPool(address _likeAddr, address[] _owners, uint8 _threshold, uint _mintTime, uint256 _mintValue) {
        require(_owners.length < 256);
        require(_owners.length > 0);
        require(_threshold > 0);
        like = LikeCoin(_likeAddr);
        for (uint8 i = 0; i < _owners.length; i++) {
            owners.push(_owners[i]);
            ownerIndex[_owners[i]] = 1 << i;
        }
        threshold = _threshold;
        mintTime = _mintTime;
        mintValue = _mintValue;
    }

    function ownersCount() constant returns (uint) {
        return owners.length;
    }

    function _nextId() internal returns (uint64 id) {
        id = nextId;
        nextId += 1;
        return id;
    }

    function mint() {
        require(now >= mintTime);
        like.mintForUserGrowthPool(mintValue);
    }

    function proposeTransfer(address _to, uint256 _value) {
        require(ownerIndex[msg.sender] != 0);
        uint64 id = _nextId();
        proposals[id] = Proposal(id, msg.sender, threshold, 0);
        transferInfo[id] = TransferInfo(id, _to, _value);
        TransferProposal(id, msg.sender, _to, _value);
    }

    function proposeSetOwners(address[] _newOwners, uint8 _newThreshold) {
        require(ownerIndex[msg.sender] != 0);
        require(_newOwners.length < 256);
        require(_newOwners.length > 0);
        require(_newThreshold > 0);
        uint64 id = _nextId();
        proposals[id] = Proposal(id, msg.sender, threshold, 0);
        setOwnersInfo[id] = SetOwnersInfo(id, _newOwners, _newThreshold);
        SetOwnersProposal(id, msg.sender, _newOwners, _newThreshold);
    }

    function confirmProposal(uint64 id) {
        require(id >= minApprovedId);
        require(proposals[id].id == id);
        require(proposals[id].confirmNeeded > 0);
        uint256 index = ownerIndex[msg.sender];
        require(index != 0);
        require((proposals[id].confirmedTable & index) == 0);
        proposals[id].confirmedTable |= index;
        if (proposals[id].confirmNeeded > 0) {
            proposals[id].confirmNeeded -= 1;
        }
        ProposalConfirmation(id, msg.sender);
    }

    function executeProposal(uint64 id) {
        require(id >= minApprovedId);
        require(proposals[id].id == id);
        require(proposals[id].confirmNeeded == 0);
        uint256 index = ownerIndex[msg.sender];
        require(index != 0);
        if (transferInfo[id].id == id) {
            like.transfer(transferInfo[id].to, transferInfo[id].value);
            delete transferInfo[id];
        } else if (setOwnersInfo[id].id == id) {
            for (uint8 i = 0; i < owners.length; i++) {
                ownerIndex[owners[i]] = 0;
            }
            owners.length = 0;
            for (i = 0; i < setOwnersInfo[id].newOwners.length; i++) {
                owners.push(setOwnersInfo[id].newOwners[i]);
                ownerIndex[setOwnersInfo[id].newOwners[i]] = 1 << i;
            }
            threshold = setOwnersInfo[id].newThreshold;
            minApprovedId = nextId;
            delete setOwnersInfo[id];
        } else {
            throw;
        }
        delete proposals[id];
        ProposalExecution(id, msg.sender);
    }
}
