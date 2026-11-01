// The given parts of the guards: moving a guard moves the pinned page and the
// latch; the moved-from guard is empty.
#include <utility>

#include "sharded.hpp"

namespace w27 {

ReadGuard::ReadGuard(ReadGuard&& other) noexcept
    : pool(std::exchange(other.pool, nullptr)), page(std::exchange(other.page, no_page)),
      bytes(std::exchange(other.bytes, nullptr)), latch(std::exchange(other.latch, nullptr)) {}

ReadGuard& ReadGuard::operator=(ReadGuard&& other) noexcept {
    if (this != &other) {
        release();
        pool = std::exchange(other.pool, nullptr);
        page = std::exchange(other.page, no_page);
        bytes = std::exchange(other.bytes, nullptr);
        latch = std::exchange(other.latch, nullptr);
    }
    return *this;
}

WriteGuard::WriteGuard(WriteGuard&& other) noexcept
    : pool(std::exchange(other.pool, nullptr)), page(std::exchange(other.page, no_page)),
      bytes(std::exchange(other.bytes, nullptr)), latch(std::exchange(other.latch, nullptr)) {}

WriteGuard& WriteGuard::operator=(WriteGuard&& other) noexcept {
    if (this != &other) {
        release();
        pool = std::exchange(other.pool, nullptr);
        page = std::exchange(other.page, no_page);
        bytes = std::exchange(other.bytes, nullptr);
        latch = std::exchange(other.latch, nullptr);
    }
    return *this;
}

}  // namespace w27
