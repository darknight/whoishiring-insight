<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface RankItem {
    name: string;
    count: number;
  }

  interface Props {
    data: RankItem[];
  }

  let { data }: Props = $props();

  let chartContainer: HTMLDivElement;
  let chart: echarts.ECharts;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  let top20 = $derived(data.slice(0, 20).reverse());

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function getChartOptions(): echarts.EChartsOption {
    const dark = isDark();
    const names = top20.map((d) => d.name);
    const counts = top20.map((d) => d.count);
    const maxCount = Math.max(...counts);

    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: 'Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        color: dark ? '#a3a3a3' : '#4b5563',
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: dark ? '#1a1a1a' : '#ffffff',
        borderColor: dark ? '#262626' : '#e5e7eb',
        textStyle: {
          color: dark ? '#f5f5f5' : '#111827',
          fontSize: 13,
        },
        formatter(params: any) {
          const p = Array.isArray(params) ? params[0] : params;
          return `<div style="font-variant-numeric:tabular-nums">
            <span style="color:${dark ? '#a3a3a3' : '#4b5563'}">${p.name}</span><br/>
            <span style="font-weight:600;font-size:15px">${p.value}</span>
            <span style="color:${dark ? '#525252' : '#9ca3af'};font-size:12px"> 次提及</span>
          </div>`;
        },
      },
      grid: {
        left: 8,
        right: 40,
        top: 8,
        bottom: 8,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        splitLine: {
          lineStyle: {
            color: dark ? '#1a1a1a' : '#f3f4f6',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: dark ? '#525252' : '#9ca3af',
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: dark ? '#a3a3a3' : '#4b5563',
          fontSize: 12,
        },
      },
      series: [
        {
          type: 'bar',
          data: counts.map((val, i) => ({
            value: val,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: COLORS[i % COLORS.length] },
                { offset: 1, color: COLORS[i % COLORS.length] + '99' },
              ]),
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: '60%',
          label: {
            show: true,
            position: 'right',
            color: dark ? '#737373' : '#6b7280',
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
            formatter: '{c}',
          },
        },
      ],
    };
  }

  $effect(() => {
    top20;
    if (chart) {
      chart.setOption(getChartOptions(), true);
    }
  });

  onMount(() => {
    chart = echarts.init(chartContainer);
    chart.setOption(getChartOptions());

    const resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartContainer);

    const observer = new MutationObserver(() => {
      chart?.setOption(getChartOptions());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      resizeObserver.disconnect();
      observer.disconnect();
      chart?.dispose();
    };
  });
</script>

<div bind:this={chartContainer} class="h-[600px] w-full"></div>
