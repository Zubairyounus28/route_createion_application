import React from 'react';
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  GitMerge,
  Navigation,
  RotateCcw,
  RotateCw,
  Undo2,
} from 'lucide-react';

interface ManeuverIconProps {
  maneuver?: string;
  className?: string;
}

export const ManeuverIcon: React.FC<ManeuverIconProps> = ({
  maneuver = '',
  className = 'w-5 h-5',
}) => {
  const m = maneuver.toUpperCase();
  if (m.includes('UTURN_LEFT') || m.includes('U_TURN_LEFT')) {
    return <Undo2 className={className} />;
  }
  if (m.includes('UTURN_RIGHT') || m.includes('U_TURN_RIGHT')) {
    return <RotateCw className={className} />;
  }
  if (m.includes('ROUNDABOUT_LEFT')) {
    return <RotateCcw className={className} />;
  }
  if (m.includes('ROUNDABOUT')) {
    return <RotateCw className={className} />;
  }
  if (m.includes('MERGE')) {
    return <GitMerge className={className} />;
  }
  if (m.includes('LEFT')) {
    return <CornerUpLeft className={className} />;
  }
  if (m.includes('RIGHT')) {
    return <CornerUpRight className={className} />;
  }
  if (m.includes('STRAIGHT') || m.includes('DEPART')) {
    return <ArrowUp className={className} />;
  }
  return <Navigation className={className} />;
};
