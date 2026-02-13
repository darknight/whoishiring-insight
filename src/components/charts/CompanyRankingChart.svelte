<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface RankingItem {
    name: string;
    count: number;
  }

  interface Props {
    data: RankingItem[];
  }

  let { data }: Props = $props();

  let chartContainer: HTMLDivElement;
  let chart: echarts.ECharts;

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function getChartOptions(): echarts.EChartsOption {
    const dark = isDark();
    const top20 = data.slice(0, 20).reverse();

    return {
      backgroundColor: 'transparent',
      textStyle: { color: dark ? '#a3a3a3' : '#4b5563' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: dark ? '#1f2937' : '#fff',
        borderColor: dark ? '#374151' : '#e5e7eb',
        textStyle: { color: dark ? '#e5e7eb' : '#1f2937' },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `<strong>${p.name}</strong><br/>招聘次数：${p.value}`;
        },
      },
      grid: { left: 120, right: 40, top: 16, bottom: 24 },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: dark ? '#1f293780' : '#f3f4f6' } },
        axisLabel: { color: dark ? '#a3a3a3' : '#6b7280' },
      },
      yAxis: {
        type: 'category',
        data: top20.map((d) => d.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: dark ? '#d1d5db' : '#374151',
          fontSize: 12,
        },
      },
      series: [
        {
          type: 'bar',
          data: top20.map((d) => d.count),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#3b82f6' },
              { offset: 1, color: '#60a5fa' },
            ]),
            borderRadius: [0, 4, 4, 0],
          },
          barMaxWidth: 24,
          label: {
            show: true,
            position: 'right',
            color: dark ? '#a3a3a3' : '#6b7280',
            fontSize: 11,
          },
        },
      ],
    };
  }

  function updateChart() {
    chart?.setOption(getChartOptions(), { notMerge: true });
  }

  onMount(() => {
    chart = echarts.init(chartContainer);
    chart.setOption(getChartOptions());
    const resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartContainer);
    const observer = new MutationObserver(() => updateChart());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { resizeObserver.disconnect(); observer.disconnect(); chart?.dispose(); };
  });
</script>

<div bind:this={chartContainer} class="h-[600px] w-full"></div>
