pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract WolfGame_FHE is ZamaEthereumConfig {
    struct Player {
        address addr;
        euint32 encryptedRole;
        euint32 encryptedAction;
        uint32 decryptedRole;
        uint32 decryptedAction;
        bool isRoleVerified;
        bool isActionVerified;
    }

    struct GameState {
        uint256 round;
        uint256 phase;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
    }

    mapping(address => Player) public players;
    address[] public playerAddresses;
    GameState public gameState;

    event PlayerJoined(address indexed player);
    event RoleRevealed(address indexed player, uint32 role);
    event ActionRevealed(address indexed player, uint32 action);
    event GameStarted();
    event GameEnded();

    modifier onlyPlayer() {
        require(players[msg.sender].addr != address(0), "Not a player");
        _;
    }

    constructor() ZamaEthereumConfig() {
        gameState = GameState(0, 0, 0, 0, false);
    }

    function joinGame(
        externalEuint32 encryptedRole,
        bytes calldata roleProof
    ) external {
        require(gameState.isActive, "Game not active");
        require(players[msg.sender].addr == address(0), "Already joined");

        require(FHE.isInitialized(FHE.fromExternal(encryptedRole, roleProof)), "Invalid encrypted role");

        players[msg.sender] = Player({
            addr: msg.sender,
            encryptedRole: FHE.fromExternal(encryptedRole, roleProof),
            encryptedAction: euint32(0),
            decryptedRole: 0,
            decryptedAction: 0,
            isRoleVerified: false,
            isActionVerified: false
        });

        FHE.allowThis(players[msg.sender].encryptedRole);
        FHE.makePubliclyDecryptable(players[msg.sender].encryptedRole);

        playerAddresses.push(msg.sender);
        emit PlayerJoined(msg.sender);
    }

    function submitAction(
        externalEuint32 encryptedAction,
        bytes calldata actionProof
    ) external onlyPlayer {
        require(gameState.phase == 1, "Not action phase");
        require(!players[msg.sender].isActionVerified, "Action already submitted");

        require(FHE.isInitialized(FHE.fromExternal(encryptedAction, actionProof)), "Invalid encrypted action");

        players[msg.sender].encryptedAction = FHE.fromExternal(encryptedAction, actionProof);

        FHE.allowThis(players[msg.sender].encryptedAction);
        FHE.makePubliclyDecryptable(players[msg.sender].encryptedAction);

        players[msg.sender].isActionVerified = true;
    }

    function revealRole(
        bytes memory abiEncodedClearRole,
        bytes memory decryptionProof
    ) external onlyPlayer {
        require(gameState.phase == 2, "Not reveal phase");
        require(!players[msg.sender].isRoleVerified, "Role already revealed");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(players[msg.sender].encryptedRole);

        FHE.checkSignatures(cts, abiEncodedClearRole, decryptionProof);

        uint32 decodedRole = abi.decode(abiEncodedClearRole, (uint32));
        players[msg.sender].decryptedRole = decodedRole;
        players[msg.sender].isRoleVerified = true;

        emit RoleRevealed(msg.sender, decodedRole);
    }

    function revealAction(
        bytes memory abiEncodedClearAction,
        bytes memory decryptionProof
    ) external onlyPlayer {
        require(gameState.phase == 2, "Not reveal phase");
        require(!players[msg.sender].isActionVerified, "Action already revealed");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(players[msg.sender].encryptedAction);

        FHE.checkSignatures(cts, abiEncodedClearAction, decryptionProof);

        uint32 decodedAction = abi.decode(abiEncodedClearAction, (uint32));
        players[msg.sender].decryptedAction = decodedAction;
        players[msg.sender].isActionVerified = true;

        emit ActionRevealed(msg.sender, decodedAction);
    }

    function startGame() external {
        require(!gameState.isActive, "Game already started");
        require(playerAddresses.length >= 5, "Not enough players");

        gameState = GameState({
            round: 1,
            phase: 1, // Action phase
            startTime: block.timestamp,
            endTime: block.timestamp + 1 days,
            isActive: true
        });

        emit GameStarted();
    }

    function endGame() external {
        require(gameState.isActive, "Game not active");
        require(block.timestamp >= gameState.endTime, "Game still in progress");

        gameState.isActive = false;
        emit GameEnded();
    }

    function advancePhase() external {
        require(gameState.isActive, "Game not active");
        require(gameState.phase == 1, "Not in action phase");
        require(block.timestamp >= gameState.endTime, "Action phase not ended");

        gameState.phase = 2; // Reveal phase
        gameState.endTime = block.timestamp + 1 hours;
    }

    function getEncryptedRole(address player) external view returns (euint32) {
        return players[player].encryptedRole;
    }

    function getEncryptedAction(address player) external view returns (euint32) {
        return players[player].encryptedAction;
    }

    function getPlayer(address player) external view returns (
        uint32 decryptedRole,
        uint32 decryptedAction,
        bool isRoleVerified,
        bool isActionVerified
    ) {
        Player storage p = players[player];
        return (p.decryptedRole, p.decryptedAction, p.isRoleVerified, p.isActionVerified);
    }

    function getAllPlayers() external view returns (address[] memory) {
        return playerAddresses;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}


