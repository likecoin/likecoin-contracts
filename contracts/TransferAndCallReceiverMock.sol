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

contract TransferAndCallReceiverMock is TransferAndCallReceiver {
    LikeCoin public like;
    mapping (bytes32 => address) keyToAddress;

    function TransferAndCallReceiverMock(address _likeAddr) public {
        like = LikeCoin(_likeAddr);
        keyToAddress[0x1337133713371337133713371337133713371337133713371337133713371337] = 0x1024102410241024102410241024102410241024;
        keyToAddress[0x1338133813381338133813381338133813381338133813381338133813381338] = 0x1025102510251025102510251025102510251025;
    }

    function giveLike(bytes32 _key, uint256 _value) public {
        address to = keyToAddress[_key];
        require(to != 0x0);
        like.transferFrom(msg.sender, to, _value);
    }

    function tokenCallback(address /* _from */, uint256 _value, bytes _data) public {
        // explicitly not checking msg.sender, for test usage
        // require(msg.sender == address(like));
        require(_data.length == 32);
        bytes32 key;
        assembly {
            key := mload(add(_data, 32))
        }
        address to = keyToAddress[key];
        require(to != 0x0);
        like.transfer(to, _value);
    }
}
