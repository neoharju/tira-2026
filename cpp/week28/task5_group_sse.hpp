// Task 5: the group functions with SSE2, one compare for all 16 control
// bytes: _mm_loadu_si128, _mm_cmpeq_epi8 and _mm_movemask_epi8. Now they call
// the scalar ones. A full slot's control byte has the top bit clear, so the
// empty-or-deleted slots are exactly the bytes whose top bit is set.
#pragma once
#include <immintrin.h>

#include "swiss.hpp"

namespace w28 {

struct SseGroup {
    static Mask match(const std::int8_t* ctrl, std::int8_t h2) {
        return ScalarGroup::match(ctrl, h2);  // TODO
    }
    static Mask match_empty(const std::int8_t* ctrl) {
        return ScalarGroup::match_empty(ctrl);  // TODO
    }
    static Mask match_empty_or_deleted(const std::int8_t* ctrl) {
        return ScalarGroup::match_empty_or_deleted(ctrl);  // TODO
    }
};

}  // namespace w28
