//    Copyright (C) 2018 LikeCoin Foundation Limited
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


pragma solidity ^0.4.25;

import "./IERC20.sol";
import "./TransferAndCallReceiver.sol";

contract LikeCoinHTLC is TransferAndCallReceiver {
    IERC20 public like;
    
    struct TransferInfo {
        uint8 state; // 0: unset, 1: initiated, 2: executed, 3: revoked
        address from;
        address to;
        uint256 value;
        uint expiry;
        bytes32 hashlock;
    }
    
    mapping(bytes32 => TransferInfo) public transferInfo;
    
    event TransferInitiated(bytes32 _id, address indexed _to, address indexed _from, uint256 _value, uint _expiry, bytes32 _hashlock);
    event TransferExecuted(bytes32 indexed _id, bytes32 _secret);
    event TransferRevoked(bytes32 indexed _id);
    
    constructor(address _like) public {
        like = IERC20(_like);
    }
    
    function tokenCallback(address _from, uint256 _value, bytes _data) public {
        require(msg.sender == address(like));
        address to;
        uint expiry; 
        bytes32 hashlock;
        assembly {
            to := and(mload(add(_data, 20)), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            expiry := mload(add(_data, 52))
            hashlock := mload(add(_data, 84))
        }
        require(expiry > now + 1800);
        bytes32 id = keccak256(abi.encodePacked(_from, to, _value, _data, now));
        require(transferInfo[id].state == 0);
        transferInfo[id] = TransferInfo({ from: _from, to: to, value: _value, expiry: expiry, hashlock: hashlock, state: 1 });
        emit TransferInitiated(id, to, _from, _value, expiry, hashlock);
    }
    
    function executeTransfer(bytes32 _id, bytes32 _secret) public {
        TransferInfo storage info = transferInfo[_id];
        require(info.state == 1);
        require(now < info.expiry);
        require(sha256(abi.encodePacked(_secret)) == info.hashlock);
        info.state = 2;
        like.transfer(info.to, info.value);
        emit TransferExecuted(_id, _secret);
    }
    
    function revokeTransfer(bytes32 _id) public {
        TransferInfo storage info = transferInfo[_id];
        require(info.state == 1);
        require(now >= info.expiry);
        info.state = 3;
        like.transfer(info.from, info.value);
        emit TransferRevoked(_id);
    }
}
