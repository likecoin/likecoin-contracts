pragma solidity ^0.4.18;

import "./LikeCoin.sol";

contract UserGrowthPool {
    LikeCoin like;

    function UserGrowthPool(address _likeAddr, address[] _owners, uint8 _threshold, uint _mintTime, uint256 _mintValue) {
        like = LikeCoin(_likeAddr);
        // TODO
    }

    function mint() {
        // TODO
    }

    function transfer(bytes32[] signatures, address _to, uint256 _value) {
        // TODO
    }

    function setOwners(bytes32[] signatures, address[] _newOwners, uint8 _newThreshold) {
        // TODO
    }

}

