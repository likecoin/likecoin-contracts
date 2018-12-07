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

import "./LikeChainRelayInterface.sol";

contract LikeChainRelayMain is LikeChainRelayState, LikeChainRelayLogicInterface {
    constructor(
        address _logicContract,
        address _tokenContract,
        address[] _validators,
        uint32[] _votingPowers
    ) public {
        uint len = _validators.length;
        require(len > 0);
        require(len < 256);
        require(_votingPowers.length == len);
        
        logicContract = _logicContract;
        logicContractIndex = 0;

        for (uint8 i = 0; i < len; i += 1) {
            address v = _validators[i];
            require(validatorInfo[v].power == 0);
            uint32 power = _votingPowers[i];
            require(power > 0);
            validators.push(v);
            validatorInfo[v] = ValidatorInfo({
                index: i,
                power: power
            });
            totalVotingPower += power;
        }
        
        tokenContract = IERC20(_tokenContract);
    }

    function commitWithdrawHash(uint64 /* height */, uint64 /* round */, bytes /* _payload */) public {
        require(logicContract.delegatecall(msg.data));
    }

    function updateValidator(address[] /* _newValidators */, bytes /* _proof */) public {
        require(logicContract.delegatecall(msg.data));
    }

    function withdraw(bytes /* _withdrawInfo */, bytes /* _proof */) public {
        require(logicContract.delegatecall(msg.data));
    }

    function upgradeLogicContract(address /* _newLogicContract */, bytes /* _proof */) public {
        require(logicContract.delegatecall(msg.data));
    }
}
