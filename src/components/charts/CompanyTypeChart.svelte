<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface Props {
    data: Record<string, number>;
  }

  let { data }: Props = $props();

  const TYPE_COLORS: Record<string, string> = {
    '大厂': '#3b82f6',
    '创业': '#10b981',
    '外企': '#f59e0b',
    '国企': '#ef4444',
  };

  let chartContainer: HTMLDivElement;
  let chart: echarts.ECharts;

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function getChartOptions(): echarts.EChartsOption {
    const dark = isDark();
    const total = Object.values(data).reduce((s, v) => s + v, 0);
    const pieData = Object.entries(data).map(([name, value]) => ({
      name,
      value,
      itemStyle: { color: TYPE_COLORS[name] || '#8b5cf6' },
    }));

    return {
      backgroundColor: 'transparent',
      textStyle: { color: dark ? '#a3a3a3' : '#4b5563' },
      tooltip: {
        trigger: 'item',
        backgroundColor: dark ? '#1f2937' : '#fff',
        borderColor: dark ? '#374151' : '#e5e7eb',
        textStyle: { color: dark ? '#e5e7eb' : '#1f2937' },
        formatter: (params: any) => {
          const pct = ((params.value / total) * 100).toFixed(1);
          return `<strong>${params.name}</strong><br/>数量：${params.value}<br/>占比：${pct}%`;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { color: dark ? '#a3a3a3' : '#4b5563' },
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: dark ? '#0a0a0a' : '#ffffff', borderWidth: 2 },
          label: {
            color: dark ? '#d1d5db' : '#374151',
            formatter: '{b}\n{d}%',
          },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold' },
          },
          data: pieData,
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

<div bind:this={chartContainer} class="h-[400px] w-full"></div>
