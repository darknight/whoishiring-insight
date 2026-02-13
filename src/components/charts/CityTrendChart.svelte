<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface TrendItem {
    yearMonth: string;
    count: number;
  }

  interface Props {
    trends: Record<string, TrendItem[]>;
    cities?: string[];
    startMonth?: string;
    endMonth?: string;
  }

  let { trends, cities, startMonth, endMonth }: Props = $props();

  let chartContainer: HTMLDivElement;
  let chart: echarts.ECharts;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  let displayCities = $derived(cities ?? Object.keys(trends).slice(0, 6));

  let filteredTrends = $derived.by(() => {
    const result: Record<string, TrendItem[]> = {};
    for (const city of displayCities) {
      let items = trends[city] ?? [];
      if (startMonth) items = items.filter((d) => d.yearMonth >= startMonth);
      if (endMonth) items = items.filter((d) => d.yearMonth <= endMonth);
      result[city] = items;
    }
    return result;
  });

  let allMonths = $derived.by(() => {
    const monthSet = new Set<string>();
    for (const city of displayCities) {
      for (const item of filteredTrends[city] ?? []) {
        monthSet.add(item.yearMonth);
      }
    }
    return Array.from(monthSet).sort();
  });

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function getChartOptions(): echarts.EChartsOption {
    const dark = isDark();

    const series: echarts.SeriesOption[] = displayCities.map((city, index) => {
      const items = filteredTrends[city] ?? [];
      const dataMap = new Map(items.map((d) => [d.yearMonth, d.count]));
      const data = allMonths.map((m) => dataMap.get(m) ?? 0);

      return {
        name: city,
        type: 'line',
        data,
        smooth: 0.3,
        symbol: 'none',
        lineStyle: {
          width: 2,
          color: COLORS[index % COLORS.length],
        },
        emphasis: {
          focus: 'series',
          itemStyle: {
            color: COLORS[index % COLORS.length],
            borderColor: dark ? '#0a0a0a' : '#fff',
            borderWidth: 2,
          },
        },
      };
    });

    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily:
          'Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        color: dark ? '#a3a3a3' : '#4b5563',
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: dark ? '#1a1a1a' : '#ffffff',
        borderColor: dark ? '#262626' : '#e5e7eb',
        textStyle: {
          color: dark ? '#f5f5f5' : '#111827',
          fontSize: 13,
        },
      },
      legend: {
        data: displayCities,
        bottom: 0,
        textStyle: {
          color: dark ? '#a3a3a3' : '#4b5563',
          fontSize: 12,
        },
        icon: 'roundRect',
        itemWidth: 14,
        itemHeight: 3,
      },
      grid: {
        left: 48,
        right: 24,
        top: 16,
        bottom: 48,
        containLabel: false,
      },
      xAxis: {
        type: 'category',
        data: allMonths,
        axisLine: { lineStyle: { color: dark ? '#262626' : '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: {
          color: dark ? '#525252' : '#9ca3af',
          fontSize: 11,
          interval: (index: number) => {
            const m = allMonths[index];
            if (!m) return false;
            if (allMonths.length <= 24) return index % 2 === 0;
            return m.endsWith('-01') || m.endsWith('-07');
          },
          formatter: (value: string) => {
            const [year, month] = value.split('-');
            return month === '01' ? year : `${month}月`;
          },
        },
      },
      yAxis: {
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
      series,
    };
  }

  $effect(() => {
    filteredTrends;
    allMonths;
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

<div bind:this={chartContainer} class="h-[400px] w-full"></div>
