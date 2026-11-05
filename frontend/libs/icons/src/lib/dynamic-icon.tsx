import { forwardRef } from 'react';
import type { ComponentType, RefAttributes } from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * Renders an icon chosen at runtime (`icon={active ? PauseIcon : PlayIcon}`,
 * `icon={item.icon}`). Accepts Lucide and Phosphor components. Static call
 * sites should render the icon component directly instead.
 *
 * `size` defaults to 1.2em, the box the app's `.lucide` rule gives Lucide
 * icons, so Phosphor icons render at the same size.
 */

export type DynamicIconComponent = ComponentType<{
  className?: string;
  size?: number | string;
}>;

export interface DynamicIconProps extends Omit<LucideProps, 'ref'> {
  icon: DynamicIconComponent;
}

export const DynamicIcon = forwardRef<SVGSVGElement, DynamicIconProps>(
  function DynamicIcon({ icon, size = '1.2em', ...props }, ref) {
    const IconComponent = icon as ComponentType<
      Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
    >;
    return <IconComponent ref={ref} size={size} {...props} />;
  }
);
