<script lang="ts">
  interface RankItem {
    name: string;
    count: number;
  }

  interface Props {
    data: RankItem[];
  }

  let { data }: Props = $props();

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  let tags = $derived.by(() => {
    if (!data.length) return [];
    const max = data[0].count;
    const min = data[data.length - 1].count;
    const range = max - min || 1;

    return data.map((item, i) => {
      const normalized = (item.count - min) / range;
      const fontSize = 0.75 + normalized * 1.75; // 0.75rem to 2.5rem
      const opacity = 0.5 + normalized * 0.5;
      const color = COLORS[i % COLORS.length];
      return { ...item, fontSize, opacity, color };
    });
  });
</script>

<div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-4">
  {#each tags as tag}
    <span
      class="inline-block cursor-default transition-transform hover:scale-110"
      style="font-size:{tag.fontSize}rem;color:{tag.color};opacity:{tag.opacity};font-weight:{tag.fontSize > 1.5 ? 700 : tag.fontSize > 1 ? 500 : 400}"
      title="{tag.name}: {tag.count} 次提及"
    >
      {tag.name}
    </span>
  {/each}
</div>
