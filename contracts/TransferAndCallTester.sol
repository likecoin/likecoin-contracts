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
import "./TransferAndCallReceiver.sol";

contract TransferAndCallTester is TransferAndCallReceiver {
    LikeCoin public like;
    address public prevSender;
    bytes32 public prevKey;
    uint8 public prevN;

    function TransferAndCallTester(address _likeAddr) public {
        like = LikeCoin(_likeAddr);
    }

    function tokenCallback(address _from, uint256 _value, bytes _data) public {
        require(msg.sender == address(like));
        bytes32 key;
        uint8 n;
        assembly {
            key := mload(add(_data, 32))
            n := and(mload(add(_data, 64)), 255)
        }
        prevKey = key;
        prevN = n;
        uint256 t = _value / 3;
        like.transfer(0x1, t);
        _value -= t;
        like.transfer(0x2, t);
        _value -= t;
        like.transfer(0x3, _value);
        prevSender = _from;
    }
}

