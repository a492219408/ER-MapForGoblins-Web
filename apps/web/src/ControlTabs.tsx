import type { MouseEvent } from 'react';
import { controlBarHref, type AppPage, type ControlPanel } from './control-bar-state';

interface ControlTabsProps {
  page: AppPage;
  activePanel: ControlPanel;
  onPanelChange(panel: ControlPanel): void;
}

const tabs: ReadonlyArray<{ id: ControlPanel; label: string }> = [
  { id: 'save', label: '存档连接' },
  { id: 'map', label: '地图控制' },
  { id: 'monsters', label: '怪物数据' },
  { id: 'items', label: '物品数据' },
];

export function ControlTabs({ page, activePanel, onPanelChange }: ControlTabsProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>, tab: ControlPanel, href: string) => {
    const isLocalPanel = tab === 'save' || tab === page;
    if (!isLocalPanel) return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onPanelChange(tab);
    history.replaceState(null, '', href);
  };

  return (
    <nav className="control-tabs" aria-label="控制栏功能">
      {tabs.map((tab) => {
        const targetPage = tab.id === 'save' ? page : tab.id;
        const href = controlBarHref(targetPage, tab.id);
        return (
          <a
            className={activePanel === tab.id ? 'active' : ''}
            href={href}
            aria-current={activePanel === tab.id ? 'page' : undefined}
            key={tab.id}
            onClick={(event) => handleClick(event, tab.id, href)}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
