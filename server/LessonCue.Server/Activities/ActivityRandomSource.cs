using System.Security.Cryptography;

namespace LessonCue.Server.Activities;

public interface IActivityRandomSource
{
    int NextInt(int minInclusive, int maxExclusive);
    double NextDouble();
    T PickWeighted<T>(IReadOnlyList<T> items, Func<T, double> weightSelector);
    void Shuffle<T>(IList<T> list);
}

public sealed class CryptoRandomSource : IActivityRandomSource
{
    public int NextInt(int minInclusive, int maxExclusive)
    {
        if (minInclusive >= maxExclusive) return minInclusive;
        return RandomNumberGenerator.GetInt32(minInclusive, maxExclusive);
    }

    public double NextDouble()
    {
        Span<byte> bytes = stackalloc byte[8];
        RandomNumberGenerator.Fill(bytes);
        var ul = BitConverter.ToUInt64(bytes);
        return (double)(ul >> 11) / (1UL << 53);
    }

    public T PickWeighted<T>(IReadOnlyList<T> items, Func<T, double> weightSelector)
    {
        if (items.Count == 0) throw new InvalidOperationException("Cannot pick from an empty collection.");
        var positiveItems = items.Where(x => weightSelector(x) > 0).ToList();
        if (positiveItems.Count == 0)
        {
            // If all weights are 0, pick uniform among all items
            return items[NextInt(0, items.Count)];
        }

        var totalWeight = positiveItems.Sum(weightSelector);
        var target = NextDouble() * totalWeight;
        var accumulated = 0.0;
        foreach (var item in positiveItems)
        {
            accumulated += weightSelector(item);
            if (accumulated >= target) return item;
        }

        return positiveItems[^1];
    }

    public void Shuffle<T>(IList<T> list)
    {
        var n = list.Count;
        while (n > 1)
        {
            n--;
            var k = RandomNumberGenerator.GetInt32(0, n + 1);
            (list[k], list[n]) = (list[n], list[k]);
        }
    }
}

public sealed class DeterministicRandomSource : IActivityRandomSource
{
    private readonly Random _random;

    public DeterministicRandomSource(int seed = 42)
    {
        _random = new Random(seed);
    }

    public int NextInt(int minInclusive, int maxExclusive)
    {
        if (minInclusive >= maxExclusive) return minInclusive;
        return _random.Next(minInclusive, maxExclusive);
    }

    public double NextDouble() => _random.NextDouble();

    public T PickWeighted<T>(IReadOnlyList<T> items, Func<T, double> weightSelector)
    {
        if (items.Count == 0) throw new InvalidOperationException("Cannot pick from an empty collection.");
        var positiveItems = items.Where(x => weightSelector(x) > 0).ToList();
        if (positiveItems.Count == 0)
        {
            return items[NextInt(0, items.Count)];
        }

        var totalWeight = positiveItems.Sum(weightSelector);
        var target = NextDouble() * totalWeight;
        var accumulated = 0.0;
        foreach (var item in positiveItems)
        {
            accumulated += weightSelector(item);
            if (accumulated >= target) return item;
        }

        return positiveItems[^1];
    }

    public void Shuffle<T>(IList<T> list)
    {
        var n = list.Count;
        while (n > 1)
        {
            n--;
            var k = _random.Next(0, n + 1);
            (list[k], list[n]) = (list[n], list[k]);
        }
    }
}
