import React from 'react';
import Svg, { Path, Polyline, Rect, Circle, Line, Polygon } from 'react-native-svg';

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
}

const iconSize = { width: 24, height: 24 };

export const HomeIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><Polyline points="9 22 9 12 15 12 15 22" />
  </Svg>
);

export const ListTodoIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="3" y="5" width="6" height="6" rx="1" /><Path d="m3 17 2 2 4-4" /><Path d="M13 6h8" /><Path d="M13 12h8" /><Path d="M13 18h8" />
  </Svg>
);

export const ClockIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" /><Polyline points="12 6 12 12 16 14" />
  </Svg>
);

export const CheckCircle2Icon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><Path d="m9 12 2 2 4-4" />
  </Svg>
);

export const ExclamationTriangleIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><Path d="M12 9v4" /><Path d="m12 17 .01 0" />
  </Svg>
);

export const ArrowPathIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><Path d="M21 3v5h-5" /><Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><Path d="M3 21v-5h5" />
  </Svg>
);

export const DocumentTextIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><Polyline points="14 2 14 8 20 8" /><Line x1="16" y1="13" x2="8" y2="13" /><Line x1="16" y1="17" x2="8" y2="17" /><Polyline points="10 9 9 9 8 9" />
  </Svg>
);

export const PhotoIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><Circle cx="9" cy="9" r="2" /><Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </Svg>
);

export const StarIcon: React.FC<IconProps & { filled?: boolean }> = ({ width, height, color = "currentColor", filled }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </Svg>
);

export const LogOutIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || 20} height={height || 20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><Polyline points="16 17 21 12 16 7" /><Line x1="21" y1="12" x2="9" y2="12" />
  </Svg>
);

export const RefreshCwIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || 20} height={height || 20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><Path d="M21 3v5h-5" /><Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><Path d="M3 21v-5h5" />
  </Svg>
);

export const SparklesIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || 16} height={height || 16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="m12 3-1.9 3.8-3.8 1.9 3.8 1.9L12 14.4l1.9-3.8 3.8-1.9-3.8-1.9L12 3z"/><Path d="M5 9l-1 2-2 1 2 1 1 2 1-2 2-1-2-1-1-2z"/><Path d="M19 15l-1 2-2 1 2 1 1 2 1-2 2-1-2-1-1-2z"/>
    </Svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || 16} height={height || 16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Polyline points="6 9 12 15 18 9" />
    </Svg>
);

export const ChevronUpIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || 16} height={height || 16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Polyline points="18 15 12 9 6 15" />
    </Svg>
);

export const CheckIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Polyline points="20 6 9 17 4 12" />
    </Svg>
);

export const XIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Line x1="18" y1="6" x2="6" y2="18" /><Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
);

export const InfoIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="12" cy="12" r="10" /><Line x1="12" y1="16" x2="12" y2="12" /><Line x1="12" y1="8" x2="12.01" y2="8" />
    </Svg>
);

export const ArrowUpIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Line x1="12" y1="19" x2="12" y2="5" /><Polyline points="5 12 12 5 19 12" />
    </Svg>
);

export const ArrowDownIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Line x1="12" y1="5" x2="12" y2="19" /><Polyline points="19 12 12 19 5 12" />
    </Svg>
);

export const CameraIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <Circle cx="12" cy="13" r="3" />
    </Svg>
);

export const MapPinIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <Circle cx="12" cy="10" r="3" />
    </Svg>
);

export const UserIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" />
  </Svg>
);

export const ClipboardIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || 20} height={height || 20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
        <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </Svg>
);

export const AttachmentIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Svg>
);

export const SearchIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
    <Svg
        width={width || iconSize.width}
        height={height || iconSize.height}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <Circle cx="11" cy="11" r="8" />
        <Path d="m21 21-4.35-4.35" />
    </Svg>
);

export const DownloadIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <Polyline points="7 10 12 15 17 10" />
    <Line x1="12" y1="15" x2="12" y2="3" />
  </Svg>
);

export const AlertTriangleIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <Path d="M12 9v4" />
    <Path d="m12 17 .01 0" />
  </Svg>
);

export const RefreshIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <Path d="M21 3v5h-5" />
    <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <Path d="M3 21v-5h5" />
  </Svg>
);

export const SmartphoneIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
    <Path d="M12 18h.01" />
  </Svg>
);

export const FileTextIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <Path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <Path d="M10 9H8" />
    <Path d="M16 13H8" />
    <Path d="M16 17H8" />
  </Svg>
);

export const ZapIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14Z" />
  </Svg>
);

export const BugIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="m8 2 1.88 1.88" />
    <Path d="M14.12 3.88 16 2" />
    <Path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
    <Path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
    <Path d="M12 20v-9" />
    <Path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
    <Path d="M6 13H2" />
    <Path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
    <Path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
    <Path d="M22 13h-4" />
    <Path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
  </Svg>
);

export const CalendarIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M8 2v4" />
    <Path d="M16 2v4" />
    <Rect width="18" height="18" x="3" y="4" rx="2" />
    <Path d="M3 10h18" />
  </Svg>
);

export const HashIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="4" y1="9" x2="20" y2="9" />
    <Line x1="4" y1="15" x2="20" y2="15" />
    <Line x1="10" y1="3" x2="8" y2="21" />
    <Line x1="16" y1="3" x2="14" y2="21" />
  </Svg>
);

export const GlobeIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="m12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    <Path d="M2 12h20" />
  </Svg>
);

export const EyeIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <Circle cx="12" cy="12" r="3" />
  </Svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ width, height, color = "currentColor" }) => (
  <Svg width={width || iconSize.width} height={height || iconSize.height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <Circle cx="12" cy="12" r="3" />
  </Svg>
);
