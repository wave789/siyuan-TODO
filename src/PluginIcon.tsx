import pluginIconUrl from './assets/plugin-icon.svg';

/** The packaged icon is bundled inline in SiYuan, so no image request is needed. */
export function PluginIcon({ size = 38 }: { size?: number }) {
  return <img src={pluginIconUrl} width={size} height={size} alt="" aria-hidden="true" draggable={false} data-todo-icon="PluginIcon" />;
}
