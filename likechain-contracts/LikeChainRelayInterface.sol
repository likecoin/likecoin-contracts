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

contract LikeChainRelayLogicInterface {
    function commitWithdrawHash(uint64 height, uint64 round, bytes _payload) public;
    function updateValidator(address[] _newValidators, bytes _proof) public;
    function withdraw(bytes _withdrawInfo, bytes _proof) public;
    function upgradeLogicContract(address _newLogicContract, bytes _proof) public;
    event Upgraded(uint256 _newLogicContractIndex, address _newLogicContract);
}

contract LikeChainRelayState {
    uint256 public logicContractIndex;
    address public logicContract;

    IERC20 public tokenContract;

    address[] public validators;
    
    struct ValidatorInfo {
        uint8 index;
        uint32 power;
    }
    
    mapping(address => ValidatorInfo) public validatorInfo;
    uint256 public totalVotingPower;
    uint public lastValidatorUpdateTime;

    uint public latestBlockHeight;
    bytes32 public latestWithdrawHash;

    mapping(bytes32 => bool) public consumedIds;
    mapping(bytes32 => bytes32) public reserved;
}
