# Content corrections, kevät 2026

This file lists every change made to the content of the material while the
site was redesigned, with the reason for each change. It is not part of the
website (`exclude` in `_config.yml`).

## How the material was checked

* **Code.** Every Python block was executed, in page order, so that later
  blocks use the definitions of earlier ones. Outputs claimed in the text
  (`print(...) # output` comments and the "Koodin tulostus on seuraava" blocks)
  were compared with the actual output. Fragments that cannot run on their own
  (method bodies, `...` placeholders) were tested inside a complete program.
* **Python versions.** CSES runs CPython 3.12 (see `raportti1.md`), so outputs
  were checked with 3.12. Outputs that depend on the version were also run
  with 3.10, 3.11, 3.13 and 3.14.
* **Claims.** Numbers, complexities and proofs were checked by computation
  (for example by enumerating all bracket sequences) and by searching for
  counterexamples with small brute-force programs.
* **Figures.** The interactive figures that replace the old images run the
  course's own code (the same edge order and loops) and their final states
  were compared with the outputs printed in the material: for example the
  `update` lines of Bellman–Ford, the `visit` lines of the maze, the
  Floyd–Warshall matrix, Kosaraju's list and count, heap lists, hash table
  positions and the coin counts 4, 3 and 634.

## Code that failed or printed something else than the text says

| Page | Was | Now | Why |
| --- | --- | --- | --- |
| 04.md | C++ `numbers.add(1);` (×3) for `std::set` | `numbers.insert(1);` | `std::set` has no `add`; the example did not compile. |
| 06.md | `else` | `else:` | `SyntaxError`. |
| 06.md | naive `def push_many(self, x, k)` | `def push_many(self, k, x)` | The method is specified and called as `push_many(k, x)`, e.g. `push_many(3, 8)`; with the old order the naive version pushed 3 eight times. |
| 07.md | `Employee.__init__(self, name, subordinates=[])` | `subordinates=None` and `[]` in the body | A mutable default argument is shared by all employees — the pitfall that the same chapter explains a few paragraphs later. |
| 07.md | `print(" "*(level*4), employee)` | `print(" " * (level * 4) + str(employee))` | `print` puts a space between its arguments, so every line had one extra space compared with the output shown. |
| 10.md | `find_longest([4, 1, 5, 6, 3, 4, 1, 8])` | `[4, 1, 5, 6, 3, 4, 3, 8]` | The text and the table use the list `[4, 1, 5, 6, 3, 4, 3, 8]`. |
| 11.md | `cout << …` (×2) | `std::cout << …` | The C++ examples have no `using namespace std`; did not compile. |
| 14.md | `print(distances) # [0, 3, -1, 2]` | `# {1: 0, 2: 3, 3: -1, 4: 2}` | The code prints a dictionary, as in the other examples of the chapter. |
| 08.md, 14.md | `while node:` in path reconstruction | `while node is not None:` | Stops too early when a node is `0`; the course examples use nodes 1…n, but CSES tasks and students' own graphs often use 0. |
| 15.md | `while self.link[x]:` in `find` | `while self.link[x] is not None:` | Same problem: if an element links to element `0`, `find` returns the wrong representative. |
| lomitusjarjestaminen.md | `if n == 1: return` | `if n <= 1: return` | `merge_sort([])` recursed until `RecursionError`. |
| mallitentti1.md | `def count_pairs(numbers):` | `def count_lists(numbers):` | The task asks for `count_lists(numbers)`. |
| mallitentti1.md | `Node(value, children=[])` with `self.children = children` | `children=None` and `[]` in the body | Shared mutable default (see chapter 7). |
| suuruusluokat.md | `for x in values:` (×2) | `for x in numbers:` | `values` is not defined (`NameError`); the parameter is `numbers`. |
| hajautus-hitaus.md | chain loop without `table[key] = True`; `while len(numbers) < n:` | `table[key] = True` added; `while len(keys) < n:` | `numbers` was not defined. Without marking the chain in `table`, no key ever exceeds the threshold, so even with the name fixed the loop never ended. With both fixes the keys slow down a dictionary about 800-fold (0.02 s → 13.7 s here; the text reports 0.02 s → 10.57 s). |

## Incorrect statements, definitions and proofs

| Page | Change | Why |
| --- | --- | --- |
| 01.md, suuruusluokat.md | "vakiot $$c$$ ja $$n_0$$" → "**positiiviset** vakiot" in the definitions of $$O$$ and $$\Omega$$ | With $$c = 0$$ allowed, every non-negative function would be $$\Omega$$ of every function. The standard definitions require $$c > 0$$. |
| 01.md | Example 2: "$$n^2+1 \le cn$$ eli $$n^2 \le cn$$" → "$$n^2+1 \le cn$$, kun $$n \ge n_0$$. Tästä seuraisi $$n^2 \le cn$$ …" | The inequality only has to hold for $$n \ge n_0$$, and $$n^2 \le cn$$ follows from it; it is not equivalent to it. |
| suuruusluokat.md | "Algoritmin aikavaativuus $$O(n)$$ ja toisaalta $$\Omega(1)$$" + a sentence on the worst case | Missing verb added; the text says the complexity cannot be written with $$\Theta$$, so it now adds that the *worst-case* complexity is $$\Theta(n)$$, which the next section relies on. |
| 02.md | "Matalan tason kielissä (kuten C++ ja Java)" → "Monissa kielissä (kuten C++:ssa ja Javassa)" | Java is not a low-level language. |
| 09.md | "noin joka sadas on kelvollinen" → "noin 1,6 prosenttia on kelvollisia" | 16796 / 2²⁰ = 16796 / 1048576 ≈ 1.6 %, i.e. about one in 62. |
| 09.md | "kolikoiden **määrä** on 13" → "kolikoiden **summa** on 13" | $$[1,2,5,5]$$ has four coins whose sum is 13. |
| 10.md | "pisin nouseva alijono on $$[1,3,4,8]$$" → "**eräs** pisin …" | Not unique: $$[1,5,6,8]$$ and $$[4,5,6,8]$$ are also of length 4. |
| 11.md | Python's `deque` "on toteutettu linkitettynä listana" → "… linkitettynä listana, jonka jokaiseen solmuun on tallennettu lohko alkioita" | CPython's deque is a doubly linked list of blocks of 64 elements. |
| 11.md | "C++:n ja Javan toteutuksissa myös alkioiden indeksointi on tehokasta" → only C++ `std::deque`; Java's `ArrayDeque` "ei kuitenkaan ole lainkaan indeksointia" | `java.util.ArrayDeque` has no `get(int)`. |
| 11.md | sliding-window minimum: "jäänyt **listan** ulkopuolelle" → "**ikkunan** ulkopuolelle" | Elements are removed when they leave the window, not the list. |
| 13.md | Kosaraju correctness proof rewritten | The old proof claimed that *all* nodes of $$b$$'s component are added to the list before *all* nodes of $$a$$'s component. Counterexample: nodes in the order 2, 1, 3 and edges 2→1, 1→2, 2→3. The first phase gives the list $$[1, 3, 2]$$: node 1 of the component $$\{1,2\}$$ is added before node 3 of the component $$\{3\}$$, although the edge 2→3 leads from the first component to the second. The correct lemma, now in the text: the node of $$a$$'s component that is added last comes after all nodes of $$b$$'s component. |
| avlpuu.md | $$f(h) > 2^{h/2}$$ → $$f(h) \ge 2^{h/2}$$ | Equality holds for $$h = 0$$. |
| avlpuu.md | "Voidaan osoittaa, että solmun lisääminen rikkoo tasapainoehdon enintään yhdessä solmussa" → insertion may break the condition at several nodes on the path, but fixing the lowest one restores the subtree height | Counterexample: inserting 9 into the tree 3(1, 7(–, 8)) breaks the condition at both 7 and 3. The conclusion (rotations at one place suffice) is unchanged. |
| avlpuu.md | Case 2 mirror: "Jos solmut $$y$$ ja $$z$$ ovat eri päin" → "Jos taas solmu $$y$$ on vasemmanpuoleinen lapsi ja solmu $$z$$ on oikeanpuoleinen lapsi" | "Eri päin" also describes case 2 itself; the mirror case has to be named. |
| keko.md | in the removal section: "Alkion **lisääminen** vie aikaa O(log n), koska alkio laskeutuu …" → "Alkion **poistaminen** …" | The sentence describes removal (the element moves down). |
| hajautustaulu.md | "Alkioille saadaan seuraavat hajautusarvot" / column "Hajautusarvo" → "sijainnit hajautustaulussa" / "Sijainti" | The table shows $$h(x) \bmod N$$, the position; the hash value of 2 is $$h(2)=14$$. |
| hajautus-hitaus.md | added: "Kokonaislukujen hajautusarvoja ei kuitenkaan satunnaisteta …" | The text said the attack is not possible against string keys (true, hash randomisation); integers are not randomised, so the attack shown still works with integer keys. |
| lista-lisaaminen.md | "$$n/2$$ alkiota on siirretty kahdesti" → "**ainakin** kahdesti" (also "kerran", "kolmesti") | Elements moved three times have also been moved twice; the sum counts "at least k times". |
| lomitusjarjestaminen.md | "lisäysjärjestäminen" → "lomitusjärjestäminen" (×2, figure text and analysis) | Wrong algorithm name. |
| lomitusjarjestaminen.md | "Rekursio päättyy, kun listalla on vain yksi alkio" → "enintään yksi alkio" (×2) | Matches the fixed base case `n <= 1`. |

## Text, code and output did not match

| Page | Change |
| --- | --- |
| 01.md | The output shows `time: 0.17 s`; the text said `0.09` seconds. |
| 04.md | `del` example: the running example has set `weights["apina"] = 150` earlier, so the printed dictionaries show `'apina': 150`, not 100. |
| linkitetty-lista.md | The memory table encodes the list $$[4,1,2,3]$$ (109 → 100 → 106 → 103); the text said $$[4,1,3,2]$$. |
| 05.md | Two tables had a two-column separator (`--- \| ---`) for three columns; fixed to three. `[4, 1, 7, 3,9]` → `[4, 1, 7, 3, 9]` (×3). |
| 08.md, 14.md | Program outputs were marked as Python code; now plain output blocks. |
| 06.md | "Sanakirja `count` sisältää kunkin luvun esiintymiskerran" → "esiintymiskertojen määrän". |

## Outputs that depend on the Python version (now as in CPython 3.12)

| Page | Change |
| --- | --- |
| 05.md | The `cmp` example prints 6 comparisons with CPython 3.10–3.12 and 8 with 3.13–3.14. The output is now labelled "Python 3.12:lla" and a note explains that 3.13 makes eight comparisons. |
| 10.md | `RecursionError: maximum recursion depth exceeded in comparison` → `… exceeded`. The old message is from CPython 3.10; 3.11–3.14 print the new one. |
| hajautus-hitaus.md | Dictionary sizes 232, 360, 640, … → 224, 352, 632, … ("(CPython 3.12)"). The old numbers are from CPython 3.10; 3.11–3.14 all print the new ones. |

## Changes that are improvements rather than error fixes

These are worth a look by the authors; revert any that do not fit the course.

| Page | Change | Reason |
| --- | --- | --- |
| lomitusjarjestaminen.md | `left[a] < right[b]` → `left[a] <= right[b]`, plus one sentence on stability | The old code sorts correctly but is not stable; with `<=` equal elements keep their order, the usual textbook form. |
| 07.md | `children if children else []` → `children if children is not None else []` (×2) | The usual idiom: an explicitly passed empty list is kept instead of silently replaced. |
| 12.md | `if room == None:` → `if room is None:` | PEP 8. |
| 02.md, 05.md | JavaScript `numbers = [];` → `let numbers = [];` (×3) | Assigning an undeclared variable is a `ReferenceError` in strict mode and in modules. |
| 03.md | `for pos in range(len(bits)):` → `for pos in range(n):` | `n = len(bits)` is defined at the start of the function. |

## Language and typos

01.md "märän" → "määrän"; 03.md "sihen" → "siihen"; 04.md "toteuttu" → "toteutettu", "yhtä monta kun" → "kuin", "jokaiseen listaan kohtaan" → "listan kohtaan"; 05.md "vaikuttaa, että" → "vaikuttaa siltä, että"; 06.md "vasta" → "vastaa"; 07.md "hierarkisia" → "hierarkkisia"; 09.md "alkoiden" → "alkioiden", "jokaisen yhdistelmää" → "yhdistelmän"; 10.md "kohdat, jossa" → "joissa"; 14.md "Floyd-Warhall" → "Floyd-Warshall"; 16.md "yhtä suuri kuin kaaren kapasiteetin" → "kapasiteetti"; avlpuu.md "(_AVL_ tree)" → "(_AVL tree_)"; lista-lisaaminen.md "Koodissa käyttää" → "Koodi käyttää"; lomitusjarjestaminen.md "Lomistusjärjestäminen" → "Lomitusjärjestäminen"; mallitentti1.md "pieneet" → "pienet"; tekoaly.md "kumoavat toisena" → "toisensa"; 00-index.md "9.4," → "9.4.,"; double spaces in 07.md, 15.md and suuruusluokat.md.

## Not changed

* **kysymykset.md** links to `https://cses.fi/tira25s/text/3444`, which belongs
  to the previous course instance (`tira25s`). It could not be checked here
  (cses.fi was not reachable from the checking environment); please verify that
  the link still points to the intended page.
* **Timings** ("Testikoneella …") depend on the machine and were not changed.
  Where they were re-measured, the order of magnitude matched.
* **hajautus-hitaus.md**: the key generator can produce a few duplicate keys
  (248 of 100 000 with the fixed code). This does not affect the conclusion,
  so the code was left as it is.
* Intentional errors in the text (the `children=[]` pitfall in chapter 7, the
  `RecursionError` example in chapter 10, the `TypeError` of an unhashable
  list) were left as they are.
