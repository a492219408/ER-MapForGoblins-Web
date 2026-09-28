import type { ReactNode } from 'react';
import { ControlTabs } from './ControlTabs';
import { GameLocaleSelect } from './GameLocaleSelect';
import type { AppPage, ControlPanel } from './control-bar-state';

interface ControlBarProps {
  page: AppPage;
  panel: ControlPanel;
  open: boolean;
  status: string;
  localePreference: string;
  interfaceLocale: string;
  children: ReactNode;
  onOpenChange(open: boolean): void;
  onPanelChange(panel: ControlPanel): void;
  onLocaleChange(locale: string): void;
}

export function ControlBar({
  page,
  panel,
  open,
  status,
  localePreference,
  interfaceLocale,
  children,
  onOpenChange,
  onPanelChange,
  onLocaleChange,
}: ControlBarProps) {
  return (
    <>
      <button
        className={open ? 'drawer-trigger active' : 'drawer-trigger'}
        type="button"
        aria-expanded={open}
        aria-controls="shared-control-bar"
        onClick={() => onOpenChange(!open)}
      >
        {open ? '隐藏控制栏' : '控制栏'}
      </button>

      <aside id="shared-control-bar" className={open ? 'drawer open' : 'drawer'} aria-hidden={!open}>
        <div className="drawer-heading">
          <a className="drawer-brand" href="./" aria-label="返回存档地图">
            <span className="brand-mark">G</span>
            <span>
              <strong>Map for Goblins</strong>
              <small>{status}</small>
            </span>
          </a>
          <button type="button" className="icon-button" aria-label="关闭控制栏" onClick={() => onOpenChange(false)}>
            ×
          </button>
        </div>

        <ControlTabs page={page} activePanel={panel} onPanelChange={onPanelChange} />

        <label className="shared-locale-control">
          <span>游戏文本</span>
          <GameLocaleSelect value={localePreference} interfaceLocale={interfaceLocale} onChange={onLocaleChange} />
        </label>

        <div className="control-bar-content">{children}</div>
      </aside>
    </>
  );
}
