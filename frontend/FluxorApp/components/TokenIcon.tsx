import React, { memo, useState, useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { Image } from 'expo-image';


// --- TOKEN SVGS ---
import AaveIcon from '../assets/Images/aave.svg';
import AeroIcon from '../assets/Images/aero.svg';
import ApeIcon from '../assets/Images/ape.svg';
import AptIcon from '../assets/Images/apt.svg';
import ArbIcon from '../assets/Images/arb.svg';
import AtomIcon from '../assets/Images/atom.svg';
import AvaxIcon from '../assets/Images/avax.svg';
import BgbIcon from '../assets/Images/bgb.svg';
import BnbIcon from '../assets/Images/bnb.svg';
import BonkIcon from '../assets/Images/bonk.svg';
import BrettIcon from '../assets/Images/brett.svg';
import BtcIcon from '../assets/Images/btc.svg';
import CakeIcon from '../assets/Images/cake.svg';
import AdaIcon from '../assets/Images/ada.svg';
import CrclxIcon from '../assets/Images/crclx.svg';
import DogeIcon from '../assets/Images/doge.svg';
import EigenIcon from '../assets/Images/eigen.svg';
import EnaIcon from '../assets/Images/ena.svg';
import FdUsdIcon from '../assets/Images/fdusd.svg';
import FlokiIcon from '../assets/Images/floki.svg';
import GhoIcon from '../assets/Images/gho.svg';
import IdIcon from '../assets/Images/id.svg';
import IntcxIcon from '../assets/Images/intcx.svg';
import JupIcon from '../assets/Images/jup.svg';
import LdoIcon from '../assets/Images/ldo.svg';
import ManaIcon from '../assets/Images/mana.svg';
import MkrIcon from '../assets/Images/mkr.svg';
import MntIcon from '../assets/Images/mnt.svg';
import MonIcon from '../assets/Images/mon.svg';
import NearIcon from '../assets/Images/near.svg';
import OmIcon from '../assets/Images/om.svg';
import OndoIcon from '../assets/Images/ondo.svg';
import OpIcon from '../assets/Images/op.svg';
import PepeIcon from '../assets/Images/pepe.svg';
import PythIcon from '../assets/Images/pyth.svg';
import SandIcon from '../assets/Images/sand.svg';
import ShibaIcon from '../assets/Images/shiba.svg';
import StrkIcon from '../assets/Images/strk.svg';
import SuiIcon from '../assets/Images/sui.svg';
import SyrupIcon from '../assets/Images/syrup.svg';
import TiaIcon from '../assets/Images/tia.svg';
import TonIcon from '../assets/Images/ton.svg';
import TrxIcon from '../assets/Images/trx.svg';
import UniIcon from '../assets/Images/uni.svg';
import UsdcIcon from '../assets/Images/usdc.svg';
import UsdeIcon from '../assets/Images/usde.svg';
import UsdtIcon from '../assets/Images/usdt.svg';
import WethIcon from '../assets/Images/weth.svg';
import ZecIcon from '../assets/Images/zec.svg';
import ZroIcon from '../assets/Images/zro.svg';
import XplIcon from '../assets/Images/xpl.svg';

// --- CHAIN SVGS ---
import EthereumChainIcon from '../assets/Chain assets/ethereum.svg';
import BnbChainIcon from '../assets/Chain assets/bnbchain.svg';
import OptimismChainIcon from '../assets/Chain assets/optimism.svg';
import ArbitrumChainIcon from '../assets/Chain assets/arbitrum.svg';
import AvalancheChainIcon from '../assets/Chain assets/avalanche.svg';
import MantleChainIcon from '../assets/Chain assets/mantle.svg';
import MonadChainIcon from '../assets/Chain assets/monad.svg';
import LineaChainIcon from '../assets/Chain assets/linea.svg';
import PlasmaChainIcon from '../assets/Chain assets/plasma.svg';

const LOCAL_ASSETS: Record<string, any> = {
  // --- TOKEN MAPPINGS ---
  'AAVE': AaveIcon,
  'AERO': AeroIcon,
  'APE': ApeIcon,
  'APT': AptIcon,
  'ARB': ArbIcon,
  'ATOM': AtomIcon,
  'AVAX': AvaxIcon,
  'BGB': BgbIcon,
  'BNB': BnbIcon,
  'BONK': BonkIcon,
  'BRETT': BrettIcon,
  'BTC': BtcIcon,
  'CAKE': CakeIcon,
  'ADA': AdaIcon,
  'CRCLX': CrclxIcon,
  'CRCL': CrclxIcon, // In case mock uses CRCL
  'DOGE': DogeIcon,
  'EIGEN': EigenIcon,
  'ENA': EnaIcon,
  'FDUSD': FdUsdIcon,
  'FLOKI': FlokiIcon,
  'GHO': GhoIcon,
  'ID': IdIcon,
  'INTCX': IntcxIcon,
  'JUP': JupIcon,
  'LDO': LdoIcon,
  'MANA': ManaIcon,
  'MKR': MkrIcon,
  'MNT': MntIcon,
  'MON': MonIcon,
  'NEAR': NearIcon,
  'OM': OmIcon,
  'ONDO': OndoIcon,
  'OP': OpIcon,
  'PEPE': PepeIcon,
  'PYTH': PythIcon,
  'SAND': SandIcon,
  'SHIBA': ShibaIcon,
  'STRK': StrkIcon,
  'SUI': SuiIcon,
  'SYRUP': SyrupIcon,
  'TIA': TiaIcon,
  'TON': TonIcon,
  'TRX': TrxIcon,
  'UNISWAP': UniIcon,
  'UNI': UniIcon,
  'USDC': UsdcIcon,
  'USDE': UsdeIcon,
  'USDT': UsdtIcon,
  'WETH': WethIcon,
  'ZEC': ZecIcon,
  'ZRO': ZroIcon,
  'XPL': XplIcon,

  // --- TOKEN RASTER IMAGES (PNG/JPG) ---
  'ETH': require('../assets/Images/eth.png'),
  'DOT': require('../assets/Images/dot.png'),
  'SOL': require('../assets/Images/sol.png'),
  'LINK': require('../assets/Images/link.png'),
  'MATIC': require('../assets/Images/matic.png'),
  'POL': require('../assets/Images/matic.png'), 
  'WLD': require('../assets/Images/wld.jpeg'),
  'PUMP': require('../assets/Images/pump.jpg'),
  'PENDLE': require('../assets/Images/pendle.png'),
  'RAY': require('../assets/Images/ray.jpg'),
  'COIN': require('../assets/Images/coinx.png'),
  'FLUXOR': require('../assets/Images/Fluxor.png'),
  'HOOD': require('../assets/Images/hoodx.png'),
  'HYPE': require('../assets/Images/hype.png'),
  'MAX': require('../assets/Images/max.jpeg'),
  'MCD': require('../assets/Images/mcdx.png'),
  'META': require('../assets/Images/metax.png'),
  'MSTR': require('../assets/Images/mstrx.png'),
  'MSFT': require('../assets/Images/msftx.jpeg'),
  'NFTX': require('../assets/Images/nflxx.jpeg'),
  'PARTI': require('../assets/Images/parti.png'),
  'PENGU': require('../assets/Images/pengu.png'),
  'PHA': require('../assets/Images/pha.png'),
  'PROVE': require('../assets/Images/prove.png'),
  'SKY': require('../assets/Images/sky.jpg'),
  'STX': require('../assets/Images/stx.jpg'),
  'TSLA': require('../assets/Images/tslax.png'),
  'VX': require('../assets/Images/vx.png'),
  'WLDX': require('../assets/Images/wld.jpeg'),
  'XAUT': require('../assets/Images/xaut.png'),
  'XRP': require('../assets/Images/xrp.png'),
  'BERA': require('../assets/Images/bera.png'),
  'MERL': require('../assets/Images/merl.png'),
  'OKB': require('../assets/Images/okb.png'),
  'S': require('../assets/Images/s.jpeg'),
  'LINEA': require('../assets/Images/linea.png'),
  
  // --- CHAIN REGISTRY MAPPINGS ---
  // These perfectly match the "icon" string in your ChainRegistryData
  'ETHEREUM': EthereumChainIcon,
  'BNBCHAIN': BnbChainIcon,           
  'SOLANA': require('../assets/Chain assets/solana.png'),
  'POLYGON': require('../assets/Chain assets/matic.png'),
  'OPTIMISM': OptimismChainIcon,      
  'ARBITRUM': ArbitrumChainIcon,      
  'AVALANCHE': AvalancheChainIcon,    
  'BASE': require('../assets/Chain assets/base.jpg'), 
  'MANTLE': MantleChainIcon,          
  'MONAD': MonadChainIcon,            
  'HYPEREVM': require('../assets/Chain assets/hyperevm.png'),
  'XLAYERCHAIN': require('../assets/Chain assets/xlayer.jpg'), 
  'MERLIN': require('../assets/Chain assets/merlin.png'),
  'LINEACHAIN': LineaChainIcon,    
  'PLASMA': PlasmaChainIcon,        
  'SONIC': require('../assets/Chain assets/sonic.jpeg'),
  'BERACHAIN': require('../assets/Chain assets/berachain.png'),
};

interface TokenIconProps {
  symbol: string;
  logoUrl?: string;
  size?: number;
}

const TokenIconComponent: React.FC<TokenIconProps> = ({ symbol, logoUrl, size = 38 }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const formattedUrl = logoUrl?.startsWith('ipfs://')
    ? logoUrl.replace('ipfs://', 'https://ipfs.io/ipfs/')
    : logoUrl;

  useEffect(() => {
    if (formattedUrl) {
      setLoading(true);
      setError(false);
    }
  }, [formattedUrl]);

  const normalizedSymbol = symbol ? symbol.toUpperCase() : '';
  const LocalAsset = LOCAL_ASSETS[normalizedSymbol];
  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: 'hidden' as const,
  };

  if (LocalAsset) {
    if (typeof LocalAsset === 'function') {
      const SvgComponent = LocalAsset as React.ElementType;
      return <View style={containerStyle}><SvgComponent width={size} height={size} /></View>;
    }
    return <Image source={LocalAsset} style={containerStyle} contentFit="cover" />;
  }

  if (formattedUrl && formattedUrl.startsWith('http')) {
    return (
      <View style={[containerStyle, { backgroundColor: 'rgba(150,150,150,0.1)' }]}>

        {loading && !error && (
          <View style={{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
          </View>
        )}

        {error ? (
          <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.55 }}>❓</Text>
          </View>
        ) : (
          <Image
            source={formattedUrl}
            style={containerStyle}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            placeholder={require('../assets/icon.png')}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setError(true); setLoading(false); }}
          />
        )}
      </View>
    );
}

  return (
    <View style={[containerStyle, { backgroundColor: 'rgba(150,150,150,0.15)', alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontSize: size * 0.55 }}>❓</Text>
    </View>
  );
};

export const TokenIcon = memo(TokenIconComponent, (prev, next) =>
  prev.symbol === next.symbol &&
  prev.logoUrl === next.logoUrl &&
  prev.size === next.size
);