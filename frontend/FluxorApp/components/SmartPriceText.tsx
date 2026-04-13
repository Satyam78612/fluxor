// import React from 'react';
// import { View, Text } from 'react-native';

// interface SmartPriceTextProps {
//   value: number;
//   fontSize?: number;
//   fontFamily?: string;
//   color?: string;
// }

// export const SmartPriceText: React.FC<SmartPriceTextProps> = ({
//   value,
//   fontSize = 16,
//   fontFamily = 'Inter-SemiBold',
//   color = '#FFFFFF', // Default fallback, but you should pass your scheme color
// }) => {
//   // 1. Handle values >= $1.00
//   if (value >= 1.0) {
//     const formatted = new Intl.NumberFormat('en-US', {
//       style: 'currency',
//       currency: 'USD',
//       minimumFractionDigits: 0, // <-- CHANGED THIS TO 0: Drops unnecessary .00 or trailing zeros!
//       maximumFractionDigits: 2,
//     }).format(value);

//     return <Text style={{ fontSize, fontFamily, color }}>{formatted}</Text>;
//   } 
  
//   // 2. Handle absolute $0
//   else if (value === 0) {
//     return <Text style={{ fontSize, fontFamily, color }}>$0</Text>;
//   } 
  
//   // 3. Handle small decimals (e.g. $0.000045)
//   else {
//     // Convert to fixed string to avoid JS scientific notation (like 4.5e-7)
//     let fixedStr = value.toFixed(20).replace(/0+$/, ''); 
//     if (fixedStr.endsWith('.')) fixedStr += '0';

//     const parts = fixedStr.split('.');
//     const fraction = parts[1] || '';

//     let zeroCount = 0;
//     for (let i = 0; i < fraction.length; i++) {
//       if (fraction[i] === '0') {
//         zeroCount++;
//       } else {
//         break;
//       }
//     }

//     // If there are 4 or more leading zeros, use the Subscript format
//     if (zeroCount >= 4) {
//       // Get up to 4 significant digits after the zeros
//       let sigStr = fraction.substring(zeroCount).substring(0, 4);

//       return (
//         <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
//           <Text style={{ fontSize, fontFamily, color }}>$0.0</Text>
          
//           {/* Subscript Number Container */}
//           <View style={{ marginBottom: -fontSize * 0.15, paddingHorizontal: 1 }}>
//             <Text style={{ 
//               fontSize: fontSize * 0.65, 
//               fontFamily: 'Inter-Bold', 
//               color 
//             }}>
//               {zeroCount}
//             </Text>
//           </View>
          
//           <Text style={{ fontSize, fontFamily, color }}>{sigStr}</Text>
//         </View>
//       );
//     } 
//     // Normal formatting for small numbers (e.g., $0.045)
//     else {
//       const formattedSmall = new Intl.NumberFormat('en-US', {
//         maximumSignificantDigits: 3,
//         useGrouping: false,
//       }).format(value);

//       return <Text style={{ fontSize, fontFamily, color }}>${formattedSmall}</Text>;
//     }
//   }
// };








import React from 'react';
import { View, Text } from 'react-native';

interface SmartPriceTextProps {
  value: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  symbol?: string; // <-- Custom symbol prop
}

export const SmartPriceText: React.FC<SmartPriceTextProps> = ({
  value,
  fontSize = 16,
  fontFamily = 'Inter-SemiBold',
  color = '#FFFFFF',
  symbol = '$', // Default to $
}) => {
  // 1. Handle values >= 1.00
  if (value >= 1.0) {
    // CRITICAL FIX: Use 'decimal' instead of 'currency' so it doesn't force a $ sign!
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'decimal', 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2,
    }).format(value);

    // Added {symbol} here
    return <Text style={{ fontSize, fontFamily, color }}>{symbol}{formatted}</Text>;
  } 
  
  // 2. Handle absolute 0
  else if (value === 0) {
    // Added {symbol} here
    return <Text style={{ fontSize, fontFamily, color }}>{symbol}0</Text>;
  } 
  
  // 3. Handle small decimals (e.g. 0.000045)
  else {
    let fixedStr = value.toFixed(20).replace(/0+$/, ''); 
    if (fixedStr.endsWith('.')) fixedStr += '0';

    const parts = fixedStr.split('.');
    const fraction = parts[1] || '';

    let zeroCount = 0;
    for (let i = 0; i < fraction.length; i++) {
      if (fraction[i] === '0') {
        zeroCount++;
      } else {
        break;
      }
    }

    // Subscript format
    if (zeroCount >= 4) {
      let sigStr = fraction.substring(zeroCount).substring(0, 4);

      return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          {/* Added {symbol} here instead of $0.0 */}
          <Text style={{ fontSize, fontFamily, color }}>{symbol}0.0</Text>
          
          <View style={{ marginBottom: -fontSize * 0.15, paddingHorizontal: 1 }}>
            <Text style={{ 
              fontSize: fontSize * 0.65, 
              fontFamily: 'Inter-Bold', 
              color 
            }}>
              {zeroCount}
            </Text>
          </View>
          
          <Text style={{ fontSize, fontFamily, color }}>{sigStr}</Text>
        </View>
      );
    } 
    // Normal formatting for small numbers
    else {
      const formattedSmall = new Intl.NumberFormat('en-US', {
        style: 'decimal',
        maximumSignificantDigits: 3,
        useGrouping: false,
      }).format(value);

      // Added {symbol} here
      return <Text style={{ fontSize, fontFamily, color }}>{symbol}{formattedSmall}</Text>;
    }
  }
};