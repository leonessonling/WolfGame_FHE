import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { JSX, useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface GameData {
  id: string;
  name: string;
  players: number;
  encryptedRole: string;
  publicValue1: number;
  publicValue2: number;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface PlayerStats {
  wins: number;
  losses: number;
  kills: number;
  survivalRate: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingGame, setCreatingGame] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newGameData, setNewGameData] = useState({ name: "", players: 8 });
  const [selectedGame, setSelectedGame] = useState<GameData | null>(null);
  const [decryptedRole, setDecryptedRole] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [playerStats, setPlayerStats] = useState<PlayerStats>({ wins: 0, losses: 0, kills: 0, survivalRate: 0 });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized) return;
      if (fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM初始化失败" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
        
        const stats = {
          wins: Math.floor(Math.random() * 20),
          losses: Math.floor(Math.random() * 15),
          kills: Math.floor(Math.random() * 50),
          survivalRate: Math.floor(Math.random() * 100)
        };
        setPlayerStats(stats);
        
        const lb = [
          { rank: 1, name: "ShadowWolf", wins: 42, kills: 127 },
          { rank: 2, name: "MoonHunter", wins: 38, kills: 112 },
          { rank: 3, name: "NightStalker", wins: 35, kills: 98 },
          { rank: 4, name: "SilentKiller", wins: 32, kills: 89 },
          { rank: 5, name: "LoneWolf", wins: 29, kills: 85 }
        ];
        setLeaderboard(lb);
        
        const hist = [
          { action: "加入游戏", game: "月夜狼嚎", time: "2023-10-31 21:45", role: "狼人" },
          { action: "创建游戏", game: "暗影猎杀", time: "2023-10-30 19:30", role: "预言家" },
          { action: "获胜", game: "血月之夜", time: "2023-10-29 22:15", role: "村民" },
          { action: "失败", game: "诅咒村庄", time: "2023-10-28 20:50", role: "女巫" }
        ];
        setHistory(hist);
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const gamesList: GameData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          gamesList.push({
            id: businessId,
            name: businessData.name,
            players: businessData.publicValue1,
            encryptedRole: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('加载游戏数据失败:', e);
        }
      }
      
      setGames(gamesList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "加载数据失败" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createGame = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingGame(true);
    setTransactionStatus({ visible: true, status: "pending", message: "使用Zama FHE创建游戏中..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("获取合约失败");
      
      const roleValue = Math.floor(Math.random() * 4) + 1;
      const businessId = `game-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, roleValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newGameData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        newGameData.players,
        0,
        "狼人杀游戏"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "游戏创建成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewGameData({ name: "", players: 8 });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用户取消交易" 
        : "提交失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingGame(false); 
    }
  };

  const decryptRole = async (gameId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(gameId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(gameId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(gameId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "在链上验证解密..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "数据解密验证成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "解密失败: " + (e.message || "未知错误") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const handleDecryptRole = async () => {
    if (!selectedGame) return;
    
    const decrypted = await decryptRole(selectedGame.id);
    if (decrypted !== null) {
      setDecryptedRole(decrypted);
    }
  };

  const getRoleName = (roleId: number | null): string => {
    if (roleId === null) return "未知";
    switch(roleId) {
      case 1: return "村民";
      case 2: return "狼人";
      case 3: return "预言家";
      case 4: return "女巫";
      case 5: return "猎人";
      default: return "未知";
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractWithSigner();
      if (!contract) return;
      
      const tx = await contract.isAvailable();
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "isAvailable调用成功!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "调用失败: " + (e.message || "未知错误") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStatsPanel = () => {
    return (
      <div className="stats-panel">
        <div className="stat-item">
          <div className="stat-value">{playerStats.wins}</div>
          <div className="stat-label">胜利场次</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{playerStats.losses}</div>
          <div className="stat-label">失败场次</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{playerStats.kills}</div>
          <div className="stat-label">击杀数</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{playerStats.survivalRate}%</div>
          <div className="stat-label">存活率</div>
        </div>
      </div>
    );
  };

  const renderLeaderboard = () => {
    return (
      <div className="leaderboard-panel">
        <h3>狼人杀排行榜</h3>
        <table>
          <thead>
            <tr>
              <th>排名</th>
              <th>玩家</th>
              <th>胜场</th>
              <th>击杀</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map(player => (
              <tr key={player.rank}>
                <td>{player.rank}</td>
                <td>{player.name}</td>
                <td>{player.wins}</td>
                <td>{player.kills}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderHistory = () => {
    return (
      <div className="history-panel">
        <h3>历史记录</h3>
        <ul>
          {history.map((item, index) => (
            <li key={index} className="history-item">
              <div className="history-time">{item.time}</div>
              <div className="history-action">{item.action} - {item.game}</div>
              <div className="history-role">身份: {item.role}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>隐私狼人杀 🔐</h1>
            <p>身份和行动加密，由合约同态裁決结果</p>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🐺</div>
            <h2>连接钱包开始游戏</h2>
            <p>请连接您的钱包以进入加密的狼人杀世界，体验公平竞技</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>使用上方按钮连接钱包</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE系统将自动初始化</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>开始创建或加入加密狼人杀游戏</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>初始化FHE加密系统...</p>
        <p>状态: {fhevmInitializing ? "初始化FHEVM" : status}</p>
        <p className="loading-note">这可能需要一些时间</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>加载加密游戏系统...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>隐私狼人杀 🔐</h1>
          <p>身份和行动加密，由合约同态裁決结果</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + 创建新游戏
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="left-panel">
          <div className="panel">
            <h2>游戏介绍</h2>
            <div className="game-intro">
              <p>隐私狼人杀是一款基于全同态加密(FHE)技术的去中心化狼人杀游戏。玩家的身份和行动都经过加密处理，确保游戏过程的公平性和隐私性。</p>
              <div className="features">
                <div className="feature">
                  <div className="feature-icon">🔒</div>
                  <div className="feature-text">身份加密</div>
                </div>
                <div className="feature">
                  <div className="feature-icon">⚖️</div>
                  <div className="feature-text">逻辑同态</div>
                </div>
                <div className="feature">
                  <div className="feature-icon">👁️</div>
                  <div className="feature-text">无上帝视角</div>
                </div>
                <div className="feature">
                  <div className="feature-icon">🏆</div>
                  <div className="feature-text">公平竞技</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="panel">
            <h2>玩家统计</h2>
            {renderStatsPanel()}
          </div>
          
          {renderLeaderboard()}
        </div>
        
        <div className="center-panel">
          <div className="panel">
            <div className="section-header">
              <h2>进行中的游戏</h2>
              <div className="header-actions">
                <button 
                  onClick={loadData} 
                  className="refresh-btn" 
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "刷新中..." : "刷新"}
                </button>
                <button 
                  onClick={callIsAvailable} 
                  className="action-btn"
                >
                  测试合约
                </button>
              </div>
            </div>
            
            <div className="games-list">
              {games.length === 0 ? (
                <div className="no-games">
                  <p>没有找到游戏</p>
                  <button 
                    className="create-btn" 
                    onClick={() => setShowCreateModal(true)}
                  >
                    创建新游戏
                  </button>
                </div>
              ) : games.map((game, index) => (
                <div 
                  className={`game-item ${selectedGame?.id === game.id ? "selected" : ""} ${game.isVerified ? "verified" : ""}`} 
                  key={index}
                  onClick={() => {
                    setSelectedGame(game);
                    setDecryptedRole(null);
                  }}
                >
                  <div className="game-title">{game.name}</div>
                  <div className="game-meta">
                    <span>玩家: {game.players}</span>
                    <span>创建时间: {new Date(game.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                  <div className="game-status">
                    状态: {game.isVerified ? "✅ 已验证" : "🔓 待验证"}
                  </div>
                  <div className="game-creator">创建者: {game.creator.substring(0, 6)}...{game.creator.substring(38)}</div>
                </div>
              ))}
            </div>
          </div>
          
          {renderHistory()}
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateGame 
          onSubmit={createGame} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingGame} 
          gameData={newGameData} 
          setGameData={setNewGameData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedGame && (
        <GameDetailModal 
          game={selectedGame} 
          onClose={() => { 
            setSelectedGame(null); 
            setDecryptedRole(null); 
          }} 
          decryptedRole={decryptedRole} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptRole={handleDecryptRole}
          getRoleName={getRoleName}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateGame: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  gameData: any;
  setGameData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, gameData, setGameData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setGameData({ ...gameData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-game-modal">
        <div className="modal-header">
          <h2>创建新游戏</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 加密</strong>
            <p>玩家身份将使用Zama FHE加密</p>
          </div>
          
          <div className="form-group">
            <label>游戏名称 *</label>
            <input 
              type="text" 
              name="name" 
              value={gameData.name} 
              onChange={handleChange} 
              placeholder="输入游戏名称..." 
            />
          </div>
          
          <div className="form-group">
            <label>玩家数量 *</label>
            <input 
              type="number" 
              name="players" 
              min="6"
              max="12"
              value={gameData.players} 
              onChange={handleChange} 
              placeholder="输入玩家数量..." 
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">取消</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !gameData.name || !gameData.players} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "加密并创建中..." : "创建游戏"}
          </button>
        </div>
      </div>
    </div>
  );
};

const GameDetailModal: React.FC<{
  game: GameData;
  onClose: () => void;
  decryptedRole: number | null;
  isDecrypting: boolean;
  decryptRole: () => void;
  getRoleName: (roleId: number | null) => string;
}> = ({ game, onClose, decryptedRole, isDecrypting, decryptRole, getRoleName }) => {
  return (
    <div className="modal-overlay">
      <div className="game-detail-modal">
        <div className="modal-header">
          <h2>游戏详情</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="game-info">
            <div className="info-item">
              <span>游戏名称:</span>
              <strong>{game.name}</strong>
            </div>
            <div className="info-item">
              <span>创建者:</span>
              <strong>{game.creator.substring(0, 6)}...{game.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>创建时间:</span>
              <strong>{new Date(game.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>玩家数量:</span>
              <strong>{game.players}</strong>
            </div>
          </div>
          
          <div className="role-section">
            <h3>你的身份</h3>
            
            <div className="role-display">
              <div className={`role-card ${decryptedRole ? "revealed" : ""}`}>
                {decryptedRole ? (
                  <>
                    <div className="role-icon">{getRoleIcon(decryptedRole)}</div>
                    <div className="role-name">{getRoleName(decryptedRole)}</div>
                  </>
                ) : (
                  <div className="role-hidden">🔒</div>
                )}
              </div>
              
              <button 
                className={`decrypt-btn ${decryptedRole ? 'decrypted' : ''}`}
                onClick={decryptRole} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 验证中..."
                ) : game.isVerified ? (
                  "✅ 已验证"
                ) : decryptedRole ? (
                  "🔄 重新验证"
                ) : (
                  "🔓 验证身份"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 自我中继解密</strong>
                <p>身份在链上加密。点击"验证身份"执行离线解密和链上验证。</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">关闭</button>
          {!game.isVerified && (
            <button 
              onClick={decryptRole} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              链上验证
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const getRoleIcon = (roleId: number): string => {
  switch(roleId) {
    case 1: return "👨‍🌾";
    case 2: return "🐺";
    case 3: return "🔮";
    case 4: return "🧪";
    case 5: return "🏹";
    default: return "❓";
  }
};

export default App;


