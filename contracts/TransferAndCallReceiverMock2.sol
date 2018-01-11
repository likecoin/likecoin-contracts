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

pragma solidity ^0.4.18;

import "./LikeCoin.sol";
import "./TransferAndCallReceiver.sol";
import "./TransferAndCallReceiverMock.sol";

contract TransferAndCallReceiverMock2 is TransferAndCallReceiver {
    LikeCoin public like;
    TransferAndCallReceiverMock public mock;

    function TransferAndCallReceiverMock2(address _likeAddr, address _mockAddr) public {
        like = LikeCoin(_likeAddr);
        mock = TransferAndCallReceiverMock(_mockAddr);
    }

    function tokenCallback(address /* _from */, uint256 _value, bytes _data) public {
        require(msg.sender == address(like));
        require(_data.length == 84);
        address to;
        uint256 value;
        bytes32 key;
        assembly {
            to := and(mload(add(_data, 20)), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            value := mload(add(_data, 52))
            key := mload(add(_data, 84))
        }
        require(value == _value);
        uint256 directTransferValue = value / 5;
        value -= directTransferValue;
        like.transfer(to, directTransferValue);
        like.approve(mock, value);
        mock.giveLike(key, value);
    }
}

