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

import "./SignatureChecker.sol";

contract SignatureCheckerImpl {
    function _bytesToSignature(bytes sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65);
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := and(mload(add(sig, 65)), 0xFF)
        }
        return (v, r, s);
    }

    bytes32 transferDelegatedHash = keccak256(
        "address contract",
        "string method",
        "address to",
        "uint256 value",
        "uint256 maxReward",
        "uint256 nonce"
    );

    function checkTransferDelegated(
        address _from,
        address _to,
        uint256 _value,
        uint256 _maxReward,
        uint256 _nonce,
        bytes _signature
    ) public constant returns (bool) {
        bytes32 hash = keccak256(
            transferDelegatedHash,
            keccak256(msg.sender, "transferDelegated", _to, _value, _maxReward, _nonce)
        );
        var (v, r, s) = _bytesToSignature(_signature);
        return ecrecover(hash, v, r, s) == _from;
    }

    bytes32 transferAndCallDelegatedHash = keccak256(
        "address contract",
        "string method",
        "address to",
        "uint256 value",
        "bytes data",
        "uint256 maxReward",
        "uint256 nonce"
    );

    function checkTransferAndCallDelegated(
        address _from,
        address _to,
        uint256 _value,
        bytes _data,
        uint256 _maxReward,
        uint256 _nonce,
        bytes _signature
    ) public constant returns (bool) {
        bytes32 hash = keccak256(
            transferAndCallDelegatedHash,
            keccak256(msg.sender, "transferAndCallDelegated", _to, _value, _data, _maxReward, _nonce)
        );
        var (v, r, s) = _bytesToSignature(_signature);
        return ecrecover(hash, v, r, s) == _from;
    }

    bytes32 transferMultipleDelegatedHash = keccak256(
        "address contract",
        "string method",
        "address[] addrs",
        "uint256[] values",
        "uint256 maxReward",
        "uint256 nonce"
    );

    function checkTransferMultipleDelegated(
        address _from,
        address[] _addrs,
        uint256[] _values,
        uint256 _maxReward,
        uint256 _nonce,
        bytes _signature
    ) public constant returns (bool) {
        bytes32 hash = keccak256(
            transferMultipleDelegatedHash,
            keccak256(msg.sender, "transferMultipleDelegated", _addrs, _values, _maxReward, _nonce)
        );
        var (v, r, s) = _bytesToSignature(_signature);
        return ecrecover(hash, v, r, s) == _from;
    }
}
