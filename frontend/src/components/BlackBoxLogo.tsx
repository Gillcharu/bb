import React from 'react';

interface LogoProps {
  className?: string;
  color?: string;
}

export const BlackBoxLogo: React.FC<LogoProps> = ({ className = "h-9 w-9", color = "white" }) => {
  return (
    <svg 
      className={`${className} shrink-0`} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer wireframe boundary octagon */}
      <path 
        d="M35 20H65L92 50L65 80H35L8 50L35 20Z" 
        stroke={color} 
        strokeWidth="5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      {/* Inner diamond */}
      <path 
        d="M50 32L68 50L50 68L32 50Z" 
        stroke={color} 
        strokeWidth="5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      {/* Structural connecting wireframe lines */}
      <line x1="50" y1="32" x2="35" y2="20" stroke={color} strokeWidth="5" strokeLinecap="round" />
      <line x1="50" y1="32" x2="65" y2="20" stroke={color} strokeWidth="5" strokeLinecap="round" />
      <line x1="50" y1="68" x2="35" y2="80" stroke={color} strokeWidth="5" strokeLinecap="round" />
      <line x1="50" y1="68" x2="65" y2="80" stroke={color} strokeWidth="5" strokeLinecap="round" />
      <line x1="32" y1="50" x2="8" y2="50" stroke={color} strokeWidth="5" strokeLinecap="round" />
      <line x1="68" y1="50" x2="92" y2="50" stroke={color} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
};

export default BlackBoxLogo;
