pragma solidity ^0.4.18;

import "./LikeCoin.sol";

contract ContributorPool {
    LikeCoin public like = LikeCoin(0x0);
    // avoid using 0 as fields in proposals are by default initialized to 0
    uint64 minUsableId = 1;
    uint64 nextId = 1;

    uint8 public threshold = 0;
    uint256 public lockDuration = 0;

    uint256 lockedCoin = 0;
    // mapping (uint64 => uint256) giveUnlockTime; // TODO move to give info
    address[] public owners;
    mapping (address => uint256) ownerIndex;

    struct Proposal {
        uint64 id;
        address proposer;
        uint8 confirmNeeded;
        uint256 confirmedTable;
    }
    mapping (uint64 => Proposal) proposals;
    event ProposalConfirmation(uint64 indexed _id, address _confirmer);
    event ProposalExecution(uint64 indexed _id, address _executer);

    struct GiveInfo {
        uint64 id;
        address to;
        uint256 value;
        uint256 unlockTime;
    }
    mapping (uint64 => GiveInfo) giveInfo;
    event GiveProposal(uint64 indexed _id, address _proposer, address _to, uint256 _value);
    event Claimed(uint64 indexed _id);

    struct SetOwnersInfo {
        uint64 id;
        uint8 newThreshold;
        address[] newOwners;
    }
    mapping (uint64 => SetOwnersInfo) setOwnersInfo;
    event SetOwnersProposal(uint64 indexed _id, address _proposer, address[] _newOwners, uint8 _newThreshold);

    function ContributorPool(address _likeAddr, address[] _owners, uint256 _lockDuration,
                             uint8 _threshold) public {
        require(_owners.length < 256);
        require(_owners.length > 0);
        require(_threshold > 0);
        require(_owners.length >= _threshold);
        like = LikeCoin(_likeAddr);
        for (uint8 i = 0; i < _owners.length; ++i) {
            owners.push(_owners[i]);
            require(ownerIndex[_owners[i]] == 0);
            ownerIndex[_owners[i]] = uint256(1) << i;
        }
        lockDuration = _lockDuration;
        threshold = _threshold;
        lockedCoin = 0;
    }

    function ownersCount() public constant returns (uint) {
        return owners.length;
    }

    function getRemainingLikeCoins() public constant returns (uint256) {
        return (like.balanceOf(address(this)) - lockedCoin);
    }

    function getUnlockTime(uint64 id) public constant returns (uint256) {
        return giveInfo[id].unlockTime;
    }

    function _nextId() internal returns (uint64 id) {
        id = nextId;
        nextId += 1;
        return id;
    }

    function proposeGive(address _to, uint256 _value) public {
        require(ownerIndex[msg.sender] != 0);
        require(_value > 0);
        uint64 id = _nextId();
        proposals[id] = Proposal(id, msg.sender, threshold, 0);
        giveInfo[id] = GiveInfo(id, _to, _value, 0);
        GiveProposal(id, msg.sender, _to, _value);
    }

    mapping(address => bool) ownerDuplicateCheck;

    function proposeSetOwners(address[] _newOwners, uint8 _newThreshold) public {
        require(ownerIndex[msg.sender] != 0);
        require(_newOwners.length < 256);
        require(_newOwners.length > 0);
        require(_newThreshold > 0);
        require(_newOwners.length >= _newThreshold);
        for (uint8 i = 0; i < _newOwners.length; ++i) {
            delete ownerDuplicateCheck[_newOwners[i]];
        }
        for (i = 0; i < _newOwners.length; ++i) {
            require(ownerDuplicateCheck[_newOwners[i]] == false);
            ownerDuplicateCheck[_newOwners[i]] = true;
        }
        uint64 id = _nextId();
        proposals[id] = Proposal(id, msg.sender, threshold, 0);
        setOwnersInfo[id] = SetOwnersInfo(id, _newThreshold, _newOwners);
        SetOwnersProposal(id, msg.sender, _newOwners, _newThreshold);
    }

    function confirmProposal(uint64 id) public {
        require(id >= minUsableId);
        require(proposals[id].id == id);
        require(proposals[id].confirmNeeded > 0);
        uint256 index = ownerIndex[msg.sender];
        require(index != 0);
        require((proposals[id].confirmedTable & index) == 0);
        proposals[id].confirmedTable |= index;
        proposals[id].confirmNeeded -= 1;
        ProposalConfirmation(id, msg.sender);
    }

    function executeProposal(uint64 id) public {
        require(id >= minUsableId);
        require(proposals[id].id == id);
        require(proposals[id].confirmNeeded == 0);
        uint256 index = ownerIndex[msg.sender];
        require(index != 0);
        if (giveInfo[id].id == id) {
            require(getRemainingLikeCoins() >= giveInfo[id].value);
            lockedCoin += giveInfo[id].value;
            giveInfo[id].unlockTime = now + lockDuration;
        } else if (setOwnersInfo[id].id == id) {
            for (uint8 i = 0; i < owners.length; ++i) {
                delete ownerIndex[owners[i]];
            }
            owners.length = 0;
            for (i = 0; i < setOwnersInfo[id].newOwners.length; ++i) {
                owners.push(setOwnersInfo[id].newOwners[i]);
                ownerIndex[setOwnersInfo[id].newOwners[i]] = uint256(1) << i;
            }
            threshold = setOwnersInfo[id].newThreshold;
            minUsableId = nextId;
            delete setOwnersInfo[id];
			delete proposals[id];
        } else {
            revert();
        }
        ProposalExecution(id, msg.sender);
    }

    function claim(uint64 id) public {
        require(proposals[id].id == id);
        address claimer = msg.sender;
        require(giveInfo[id].to == claimer);
        require(giveInfo[id].unlockTime > 0);
        require(giveInfo[id].unlockTime < now);
        require(lockedCoin > likeCoin);
        uint256 likeCoin = giveInfo[id].value;
        delete proposals[id];
        delete giveInfo[id];
        like.transfer(claimer, likeCoin);
        lockedCoin -= likeCoin;
        Claimed(id);
    }
}
