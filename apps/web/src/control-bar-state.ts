export type AppPage = 'map' | 'monsters' | 'items';
export type ControlPanel = 'save' | AppPage;

export function readAppPage(search = location.search): AppPage {
  const value = new URLSearchParams(search).get('page');
  return value === 'monsters' || value === 'items' ? value : 'map';
}

export function readControlPanel(page: AppPage, search = location.search): ControlPanel {
  const value = new URLSearchParams(search).get('panel');
  return value === 'save' || value === page ? value : page;
}

export function controlBarHref(page: AppPage, panel: ControlPanel): string {
  const params = new URLSearchParams();
  if (page !== 'map') params.set('page', page);
  params.set('panel', panel);
  return `?${params.toString()}`;
}
