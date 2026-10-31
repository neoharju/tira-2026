#include "roaring.hpp"

#include <algorithm>
#include <bit>

namespace w21 {

namespace {

Container make_container(std::span<const std::uint16_t> low) {
    Container c;
    c.cardinality = static_cast<std::uint32_t>(low.size());
    std::size_t runs = 0;
    for (std::size_t i = 0; i < low.size(); ++i) runs += i == 0 || low[i] != low[i - 1] + 1;
    const std::size_t array_bytes = 2 * low.size(), bitmap_bytes = 8 * BITMAP_WORDS, run_bytes = 4 * runs;
    if (array_bytes <= bitmap_bytes && array_bytes <= run_bytes) {
        c.kind = Container::Array;
        c.array.assign(low.begin(), low.end());
    } else if (bitmap_bytes <= run_bytes) {
        c.kind = Container::Bitmap;
        c.bitmap.assign(BITMAP_WORDS, 0);
        for (std::uint16_t x : low) c.bitmap[x >> 6] |= std::uint64_t{1} << (x & 63);
    } else {
        c.kind = Container::Run;
        for (std::size_t i = 0; i < low.size();) {
            std::size_t j = i + 1;
            while (j < low.size() && low[j] == low[j - 1] + 1) ++j;
            c.array.push_back(low[i]);
            c.array.push_back(static_cast<std::uint16_t>(j - i - 1));
            i = j;
        }
    }
    return c;
}

}  // namespace

Roaring Roaring::from_sorted(std::span<const std::uint32_t> values) {
    Roaring r;
    std::vector<std::uint16_t> low;
    for (std::size_t i = 0; i < values.size();) {
        const auto key = static_cast<std::uint16_t>(values[i] >> 16);
        low.clear();
        for (; i < values.size() && values[i] >> 16 == key; ++i) low.push_back(static_cast<std::uint16_t>(values[i]));
        r.keys.push_back(key);
        r.containers.push_back(make_container(low));
    }
    return r;
}

std::vector<std::uint32_t> Roaring::to_vector() const {
    std::vector<std::uint32_t> out;
    out.reserve(cardinality());
    for (std::size_t i = 0; i < keys.size(); ++i) {
        const std::uint32_t high = std::uint32_t{keys[i]} << 16;
        const Container& c = containers[i];
        if (c.kind == Container::Array) {
            for (std::uint16_t x : c.array) out.push_back(high | x);
        } else if (c.kind == Container::Bitmap) {
            for (std::size_t w = 0; w < c.bitmap.size(); ++w)
                for (std::uint64_t bits = c.bitmap[w]; bits; bits &= bits - 1)
                    out.push_back(high | static_cast<std::uint32_t>(64 * w + static_cast<std::size_t>(std::countr_zero(bits))));
        } else {
            for (std::size_t j = 0; j + 1 < c.array.size(); j += 2)
                for (std::uint32_t x = c.array[j]; x <= std::uint32_t{c.array[j]} + c.array[j + 1]; ++x) out.push_back(high | x);
        }
    }
    return out;
}

std::uint64_t Roaring::cardinality() const {
    std::uint64_t n = 0;
    for (const Container& c : containers) n += c.cardinality;
    return n;
}

std::size_t Roaring::bytes() const {
    std::size_t n = 0;
    for (const Container& c : containers) n += 2 * c.array.size() + 8 * c.bitmap.size();
    return n;
}

}  // namespace w21
