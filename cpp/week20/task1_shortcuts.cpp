// Task 1: the shortcuts of one node. For every arc u -> v, one witness search
// from u (ws.run) finds the distances to all w with an arc v -> w.
#include "tasks.hpp"

namespace w20 {

std::vector<Shortcut> shortcuts_for(const DynGraph& g, Node v, std::span<const std::uint8_t> skip, WitnessSearch& ws) {
    (void)g;  // TODO
    (void)v;
    (void)skip;
    (void)ws;
    return {};
}

}  // namespace w20
