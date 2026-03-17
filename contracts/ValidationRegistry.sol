// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ValidationRegistry
 * @notice Minimal ERC-8004 Validation Registry for MVP testing.
 *
 * Flow:
 *   1. Any address calls validationRequest() to post a request.
 *   2. Validator nodes watch ValidationRequest events, score the mandate,
 *      then call postValidationResponse() with a 0–100 score.
 *   3. Each validator can respond at most once per requestId.
 */
contract ValidationRegistry {

    // ── Structs ──────────────────────────────────────────────────────────────

    struct RequestData {
        address  router;
        string   requestURI;
        bytes32  requestHash;
        uint256  deadline;
        bool     exists;
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => RequestData)                     private _requests;
    mapping(bytes32 => mapping(address => bool))        private _hasResponded;

    // ── Events ───────────────────────────────────────────────────────────────

    event ValidationRequest(
        address indexed router,
        bytes32 indexed requestId,
        string          requestURI,
        bytes32         requestHash,
        uint256         deadline
    );

    event ValidationResponse(
        address indexed router,
        bytes32 indexed requestId,
        uint8           score,
        address indexed validator
    );

    // ── Errors ───────────────────────────────────────────────────────────────

    error DeadlineInPast();
    error RequestNotFound();
    error AlreadyResponded();
    error ScoreOutOfRange();
    error RequestAlreadyExists();

    // ── Write functions ──────────────────────────────────────────────────────

    /**
     * @notice Submit a new validation request.
     * @param router      Validator address that will process this request.
     * @param requestId   Unique bytes32 identifier for this request.
     * @param requestURI  URL where the RouterPayload JSON can be fetched.
     * @param requestHash keccak256 of the payload at requestURI.
     * @param deadline    Unix timestamp after which the request is expired.
     */
    function validationRequest(
        address router,
        bytes32 requestId,
        string  calldata requestURI,
        bytes32 requestHash,
        uint256 deadline
    ) external {
        if (deadline <= block.timestamp)      revert DeadlineInPast();
        if (_requests[requestId].exists)      revert RequestAlreadyExists();

        _requests[requestId] = RequestData({
            router:      router,
            requestURI:  requestURI,
            requestHash: requestHash,
            deadline:    deadline,
            exists:      true
        });

        emit ValidationRequest(router, requestId, requestURI, requestHash, deadline);
    }

    /**
     * @notice Post a validation score for a request.
     * @param requestId  The request being responded to.
     * @param score      Aggregated score in [0, 100].
     */
    function postValidationResponse(bytes32 requestId, uint8 score) external {
        if (!_requests[requestId].exists)          revert RequestNotFound();
        if (_hasResponded[requestId][msg.sender])  revert AlreadyResponded();
        if (score > 100)                           revert ScoreOutOfRange();

        _hasResponded[requestId][msg.sender] = true;

        RequestData storage r = _requests[requestId];
        emit ValidationResponse(r.router, requestId, score, msg.sender);
    }

    // ── View functions ───────────────────────────────────────────────────────

    /**
     * @notice Read back a stored validation request.
     */
    function getValidationRequest(bytes32 requestId)
        external
        view
        returns (
            address router,
            string  memory requestURI,
            bytes32 requestHash,
            uint256 deadline
        )
    {
        RequestData storage r = _requests[requestId];
        if (!r.exists) revert RequestNotFound();
        return (r.router, r.requestURI, r.requestHash, r.deadline);
    }

    /**
     * @notice Check whether a validator has already responded to a request.
     */
    function hasResponded(bytes32 requestId, address validator)
        external
        view
        returns (bool)
    {
        return _hasResponded[requestId][validator];
    }
}
