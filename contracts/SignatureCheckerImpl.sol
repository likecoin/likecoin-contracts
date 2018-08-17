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

pragma solidity ^0.4.24;

import "./SignatureChecker.sol";

contract SignatureCheckerImpl {

    struct EIP712Domain {
        string  name;
        string  version;
        uint256 chainId;
        address verifyingContract;
    }

    struct TransferDelegatedData {
        address to;
        uint256 value;
        uint256 maxReward;
        uint256 nonce;
    }

    struct TransferAndCallDelegatedData {
        address to;
        uint256 value;
        bytes data;
        uint256 maxReward;
        uint256 nonce;
    }

    struct TransferMultipleDelegatedData {
        address[] addrs;
        uint256[] values;
        uint256 maxReward;
        uint256 nonce;
    }

    bytes32 constant EIP712DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 constant TRANSFER_DELEGATED_DATA_TYPEHASH = keccak256(
        "TransferDelegatedData(address to,uint256 value,uint256 maxReward,uint256 nonce)"
    );

    bytes32 constant TRANSFER_AND_CALL_DELEGATED_DATA_TYPEHASH = keccak256(
        "TransferAndCallDelegatedData(address to,uint256 value,bytes data,uint256 maxReward,uint256 nonce)"
    );

    bytes32 constant TRANSFER_MULTIPLE_DELEGATED_DATA_TYPEHASH = keccak256(
        "TransferMultipleDelegatedData(address[] addrs,uint256[] values,uint256 maxReward,uint256 nonce)"
    );

    bytes32 DOMAIN_SEPARATOR;

    constructor () public {
        DOMAIN_SEPARATOR = hash(EIP712Domain({
            name: "LikeCoin",
            version: '1',
            chainId: 1,
            verifyingContract: 0x02F61Fd266DA6E8B102D4121f5CE7b992640CF98
        }));
    }

    function hash(EIP712Domain eip712Domain) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            EIP712DOMAIN_TYPEHASH,
            keccak256(bytes(eip712Domain.name)),
            keccak256(bytes(eip712Domain.version)),
            eip712Domain.chainId,
            eip712Domain.verifyingContract
        ));
    }

    function hash(TransferDelegatedData data) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            TRANSFER_DELEGATED_DATA_TYPEHASH,
            data.to,
            data.value,
            data.maxReward,
            data.nonce
        ));
    }

    function hash(TransferAndCallDelegatedData data) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            TRANSFER_AND_CALL_DELEGATED_DATA_TYPEHASH,
            data.to,
            data.value,
            keccak256(data.data),
            data.maxReward,
            data.nonce
        ));
    }

    function hash(TransferMultipleDelegatedData data) internal pure returns (bytes32) {
        bytes32 addrsHash = keccak256(abi.encodePacked(data.addrs));
        bytes32 valuesHash = keccak256(abi.encodePacked(data.values));
        return keccak256(abi.encode(
            TRANSFER_MULTIPLE_DELEGATED_DATA_TYPEHASH,
            addrsHash,
            valuesHash,
            data.maxReward,
            data.nonce
        ));
    }

    function _bytesToSignature(bytes sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65);
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := and(mload(add(sig, 65)), 0xFF)
        }
        if (v < 27) {
            v += 27;
        }
        return (v, r, s);
    }

    function checkTransferDelegated(
        address _from,
        address _to,
        uint256 _value,
        uint256 _maxReward,
        uint256 _nonce,
        bytes _signature
    ) public constant returns (bool) {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            hash(TransferDelegatedData({
                to: _to,
                value: _value,
                maxReward: _maxReward,
                nonce: _nonce
            }))
        ));
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = _bytesToSignature(_signature);
        return 0x0 != _from && ecrecover(digest, v, r, s) == _from;
    }

    function checkTransferAndCallDelegated(
        address _from,
        address _to,
        uint256 _value,
        bytes _data,
        uint256 _maxReward,
        uint256 _nonce,
        bytes _signature
    ) public constant returns (bool) {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            hash(TransferAndCallDelegatedData({
                to: _to,
                value: _value,
                data: _data,
                maxReward: _maxReward,
                nonce: _nonce
            }))
        ));
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = _bytesToSignature(_signature);
        return 0x0 != _from && ecrecover(digest, v, r, s) == _from;
    }

    function checkTransferMultipleDelegated(
        address _from,
        address[] _addrs,
        uint256[] _values,
        uint256 _maxReward,
        uint256 _nonce,
        bytes _signature
    ) public constant returns (bool) {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            hash(TransferMultipleDelegatedData({
                addrs: _addrs,
                values: _values,
                maxReward: _maxReward,
                nonce: _nonce
            }))
        ));
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = _bytesToSignature(_signature);
        return 0x0 != _from && ecrecover(digest, v, r, s) == _from;
    }
}
