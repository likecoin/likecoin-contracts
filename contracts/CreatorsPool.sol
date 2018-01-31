//    Copyright (C) 2017 LikeCoin Foundation Limited
//
//    This file is part of LikeCoin Smart Contract.
//
//    LikeCoin Smart Contract is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    LikeCoin Smart Contract is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with LikeCoin Smart Contract.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.4.18;

import "./LikeCoin.sol";

contract CreatorsPool {
    LikeCoin public like = LikeCoin(0x0);
    address[] public owners;
    uint8 public threshold = 0;
    uint public mintTime = 0;
    uint256 public mintValue = 0;

    // returns a number which is a power of 2, so we can use uint256 and bitwise operations to simulate a set
    mapping (address => uint256) ownerIndex;

    // avoid using 0 as fields in proposals are by default initialized to 0
    uint64 minUsableId = 1;
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
        uint8 newThreshold;
        address[] newOwners;
    }
    event SetOwnersProposal(uint64 indexed _id, address _proposer, address[] _newOwners, uint8 _newThreshold);

    mapping (uint64 => Proposal) proposals;
    mapping (uint64 => TransferInfo) transferInfo;
    mapping (uint64 => SetOwnersInfo) setOwnersInfo;

    function CreatorsPool(address _likeAddr, address[] _owners, uint8 _threshold, uint _mintTime, uint256 _mintValue) public {
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
        threshold = _threshold;
        mintTime = _mintTime;
        mintValue = _mintValue;
    }

    function ownersCount() public constant returns (uint) {
        return owners.length;
    }

    function _nextId() internal returns (uint64 id) {
        id = nextId;
        nextId += 1;
        return id;
    }

    function mint() public {
        require(now >= mintTime);
        like.mintForCreatorsPool(mintValue);
    }

    function proposeTransfer(address _to, uint256 _value) public {
        require(ownerIndex[msg.sender] != 0);
        require(_value > 0);
        uint64 id = _nextId();
        proposals[id] = Proposal(id, msg.sender, threshold, 0);
        transferInfo[id] = TransferInfo(id, _to, _value);
        TransferProposal(id, msg.sender, _to, _value);
    }

    mapping (address => bool) ownerDuplicationCheck;

    function proposeSetOwners(address[] _newOwners, uint8 _newThreshold) public {
        require(ownerIndex[msg.sender] != 0);
        require(_newOwners.length < 256);
        require(_newOwners.length > 0);
        require(_newThreshold > 0);
        require(_newOwners.length >= _newThreshold);
        for (uint8 i = 0; i < _newOwners.length; ++i) {
            delete ownerDuplicationCheck[_newOwners[i]];
        }
        for (i = 0; i < _newOwners.length; ++i) {
            require(ownerDuplicationCheck[_newOwners[i]] == false);
            ownerDuplicationCheck[_newOwners[i]] = true;
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
        if (transferInfo[id].id == id) {
            like.transfer(transferInfo[id].to, transferInfo[id].value);
            delete transferInfo[id];
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
        } else {
            revert();
        }
        delete proposals[id];
        ProposalExecution(id, msg.sender);
    }
}
