<script lang="ts">
  type RangePreset = 'all' | '1y' | '2y' | '3y';

  interface Props {
    onchange?: (range: { start: string; end: string } | null) => void;
  }

  let { onchange }: Props = $props();

  let activePreset: RangePreset | null = $state('all');
  let selectedYear: number | null = $state(null);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2019 + 1 }, (_, i) => 2019 + i);

  const presets: { key: RangePreset; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: '1y', label: '近1年' },
    { key: '2y', label: '近2年' },
    { key: '3y', label: '近3年' },
  ];

  function getPresetRange(preset: RangePreset): { start: string; end: string } | null {
    if (preset === 'all') return null;
    const now = new Date();
    const yearsBack = parseInt(preset);
    const start = `${now.getFullYear() - yearsBack}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return { start, end };
  }

  function selectPreset(preset: RangePreset) {
    activePreset = preset;
    selectedYear = null;
    onchange?.(getPresetRange(preset));
  }

  function selectYear(year: number) {
    selectedYear = year;
    activePreset = null;
    onchange?.({ start: `${year}-01`, end: `${year}-12` });
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <span class="text-sm font-medium text-(--color-text-secondary)">时间范围</span>

  <div class="flex items-center gap-1 rounded-lg bg-(--color-surface-tertiary) p-0.5">
    {#each presets as preset}
      <button
        onclick={() => selectPreset(preset.key)}
        class="rounded-md px-2.5 py-1 text-xs font-medium transition-all
          {activePreset === preset.key
            ? 'bg-(--color-surface) text-(--color-text-primary) shadow-sm'
            : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'}"
      >
        {preset.label}
      </button>
    {/each}
  </div>

  <div class="h-4 w-px bg-(--color-border)"></div>

  <div class="flex flex-wrap items-center gap-1">
    {#each years as year}
      <button
        onclick={() => selectYear(year)}
        class="rounded-md px-2 py-1 text-xs font-medium tabular-nums transition-all
          {selectedYear === year
            ? 'bg-(--color-surface-tertiary) text-(--color-text-primary) shadow-sm'
            : 'text-(--color-text-tertiary) hover:text-(--color-text-secondary)'}"
      >
        {year}
      </button>
    {/each}
  </div>
</div>
