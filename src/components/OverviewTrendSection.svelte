<script lang="ts">
  import PostingTrendChart from './PostingTrendChart.svelte';
  import TimeRangeFilter from './TimeRangeFilter.svelte';

  interface TrendItem {
    yearMonth: string;
    count: number;
  }

  interface Props {
    data: TrendItem[];
  }

  let { data }: Props = $props();

  let startMonth: string | undefined = $state(undefined);
  let endMonth: string | undefined = $state(undefined);

  function handleRangeChange(range: { start: string; end: string } | null) {
    if (range) {
      startMonth = range.start;
      endMonth = range.end;
    } else {
      startMonth = undefined;
      endMonth = undefined;
    }
  }
</script>

<div class="rounded-xl border border-(--color-border) bg-(--color-surface) p-6">
  <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 class="text-lg font-semibold text-(--color-text-primary)">月度发帖趋势</h2>
      <p class="mt-0.5 text-sm text-(--color-text-tertiary)">每月招聘帖数量变化</p>
    </div>
    <TimeRangeFilter onchange={handleRangeChange} />
  </div>
  <PostingTrendChart {data} {startMonth} {endMonth} />
</div>
