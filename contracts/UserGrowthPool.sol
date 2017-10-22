pragma solidity ^0.4.15;

import "./LikeCoin.sol";

contract UserGrowthPool {
    LikeCoin like;
    address[] public owners;
    uint8 public threshold;
    uint public mintTime;
    uint256 public mintValue;

    mapping (address => mapping (uint64 => bool)) usedNonce;
    // randomly generated code to distinguish signatures of different functions
    uint32 constant SET_OWNER_CODE = 2086986856;
    uint32 constant TRANSFER_CODE = 487527886;

    // returns a number which is a power of 2, so we can use uint256 and bitwise operations to simulate a set
    mapping (address => uint256) ownerIndex;

    function UserGrowthPool(address _likeAddr, address[] _owners, uint8 _threshold, uint _mintTime, uint256 _mintValue) {
        like = LikeCoin(_likeAddr);
        for (uint8 i = 0; i < _owners.length; i++) {
            owners.push(_owners[i]);
            ownerIndex[_owners[i]] = 1 << i;
        }
        threshold = _threshold;
        mintTime = _mintTime;
        mintValue = _mintValue;
    }

    function ownersCount() constant returns (uint) {
        return owners.length;
    }

    function mint() {
        require(now >= mintTime);
        like.mintForUserGrowthPool(mintValue);
    }

    function hashTransfer(uint64 _nonce, address _to, uint256 _value) constant returns (bytes32) {
        return keccak256(_nonce, this, TRANSFER_CODE, _to, _value);
    }

    function transfer(bytes32[] _rs, bytes32[] _ss, uint8[] _vs, uint64[] _nonce, address _to, uint256 _value) {
        require(_rs.length == threshold);
        require(_ss.length == threshold);
        require(_vs.length == threshold);
        require(_nonce.length == threshold);
        uint256 used = 0;
        address[] memory sources = new address[](threshold);
        for (uint8 i = 0; i < threshold; i++) {
            bytes32 hash = hashTransfer(_nonce[i], _to, _value);
            address source = ecrecover(hash, _vs[i], _rs[i], _ss[i]);
            uint256 index = ownerIndex[source];
            require(index != 0);
            require((used & index) == 0);
            require(!usedNonce[source][_nonce[i]]);
            used |= index;
            sources[i] = source;
        }
        like.transfer(_to, _value);
        for (i = 0; i < threshold; i++) {
            usedNonce[sources[i]][_nonce[i]] = true;
        }
    }

    function hashSetOwners(uint64 _nonce, address[] _newOwners, uint8 _newThreshold) constant returns (bytes32) {
        return keccak256(_nonce, this, SET_OWNER_CODE, _newOwners, _newThreshold);
    }

    function setOwners(bytes32[] _rs, bytes32[] _ss, uint8[] _vs, uint64[] _nonce, address[] _newOwners, uint8 _newThreshold) {
        require(_rs.length == threshold);
        require(_ss.length == threshold);
        require(_vs.length == threshold);
        require(_nonce.length == threshold);
        uint256 used = 0;
        address[] memory sources = new address[](threshold);
        for (uint8 i = 0; i < threshold; i++) {
            bytes32 hash = hashSetOwners(_nonce[i], _newOwners, _newThreshold);
            address source = ecrecover(hash, _vs[i], _rs[i], _ss[i]);
            uint256 index = ownerIndex[source];
            require(index != 0);
            require((used & index) == 0);
            require(!usedNonce[source][_nonce[i]]);
            used |= index;
            sources[i] = source;
        }
        for (i = 0; i < owners.length; i++) {
            ownerIndex[owners[i]] = 0;
        }
        owners.length = 0;
        for (i = 0; i < _newOwners.length; i++) {
            owners.push(_newOwners[i]);
            ownerIndex[_newOwners[i]] = 1 << i;
        }
        threshold = _newThreshold;
        for (i = 0; i < threshold; i++) {
            usedNonce[sources[i]][_nonce[i]] = true;
        }
    }
}
