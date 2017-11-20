pragma solidity ^0.4.18;

import "./LikeCoin.sol";

contract ContributorPool {
    LikeCoin like;

    function ContributorPool(address _likeAddr, address[] _owners, uint _locktime) {
        like = LikeCoin(_likeAddr);
        // TODO
    }

    event Given(address indexed _to, uint indexed _id, uint256 _value, uint _unlockTime);

    function give(bytes32[] _signatures, address _to, uint256 _value) returns (uint id) {
        // TODO
    }

    function take(uint _id) {
        // TODO
    }
}
