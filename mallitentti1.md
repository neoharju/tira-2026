---
title: Mallitentti (I-osa)
permalink: /mallitentti1/
hide: true
---

# Mallitentti (I-osa)

Seuraava mallitentti antaa näytteen siitä, millainen on kurssin I-osan tentti.

Tentti muodostuu viidestä tehtävästä, jotka ovat samantapaisia kuin mallitentissä. Kurssin suoritus vaatii, että ratkaiset ainakin kolme ensimmäistä tehtävää. Kaksi viimeistä tehtävää liittyy arvosanoihin 4 ja 5.

Ohjelmointitehtävissä koodi tulee toteuttaa Python-kielellä. Oleellista on, että koodin logiikka ja kokonaisuus ovat kunnossa. Erityisesti pienet virheet (esim. jostain puuttuu sulku) eivät haittaa.

## Tehtävä 1

Tehtävä 1 on ohjelmointitehtävä, jonka aiheena on ohjelmoinnin perusteet. Sinun tulee ratkaista tämä tehtävä, jotta pääset kurssin läpi.

**Esimerkkitehtävä**

Tee Python-funktio `create_list(n)`, joka palauttaa listan, jossa on kerran luku 1, kahdesti luku 2, kolmesti luku 3, jne. lukuun `n` asti.

Esimerkiksi jos `n = 4`, funktion tulee palauttaa lista `[1, 2, 2, 3, 3, 3, 4, 4, 4, 4]`.

**Malliratkaisu**

```python
def create_list(n):
    result = []
    for i in range(1, n + 1):
        for j in range(i):
            result.append(i)
    return result
```

## Tehtävä 2

Tehtävä 2 on ohjelmointitehtävä, jossa tulee toteuttaa tehokas algoritmi. Sinun tulee ratkaista tämä tehtävä, jotta pääset kurssin läpi.

Tehtävän ratkaisuun riittää koodi, jossa for-silmukka käy listan läpi ja käsittelee muuttujia ja tietorakenteita sopivalla tavalla.

**Esimerkkitehtävä**

Tee Python-funktio `count_lists(numbers)`, joka kertoo, monessako listan osalistassa on alussa ja lopussa sama luku. Funktion tulee toimia tehokkaasti suurillakin listoilla.

Esimerkiksi jos lista on `[1, 2, 1, 2, 1]`, haluttu tulos on 9, koska mahdolliset osalistat ovat `[1]` (3 kertaa), `[2]` (2 kertaa), `[1, 2, 1]` (2 kertaa), `[2, 1, 2]` ja `[1, 2, 1, 2, 1]`.

**Malliratkaisu**

```python
def count_lists(numbers):
    counts = {}
    result = 0
    for number in numbers:
        if number not in counts:
            counts[number] = 0
        counts[number] += 1
        result += counts[number]
    return result
```

## Tehtävä 3

Tehtävä 3 on ohjelmointitehtävä, jossa tulee toteuttaa rekursiivinen algoritmi puun läpikäyntiin. Sinun tulee ratkaista tämä tehtävä, jotta pääset kurssin läpi.

Tehtävän ratkaisuun riittää koodi, joka käy läpi rekursiivisesti solmun lapset ja laskee halutun tuloksen muuttujien avulla.

**Esimerkkitehtävä**

Toteuta rekursiivinen funktio `count_leaves(node)`, joka laskee, montako lehteä annetussa puussa on. Funktiolle annetaan parametrina puun juurisolmu. Puu on esitetty seuraavan luokan avulla:

```python
class Node:
    def __init__(self, value, children=None):
        self.value = value
        self.children = children if children is not None else []

    def __repr__(self):
        return str(self.value)
```

**Malliratkaisu**

```python
def count_leaves(node):
    if node.children == []:
        return 1

    result = 0
    for child in node.children:
        result += count_leaves(child)
    return result
```

## Tehtävä 4

Tehtävä 4 on vaikeampi ohjelmointitehtävä. Sinun tulee ratkaista tämä tehtävä, jos haluat kurssista arvosanan 4 tai 5. Tehtävä ei vaikuta muihin arvosanoihin.

**Esimerkkitehtävä**

Tee Python-funktio `min_removals(numbers)`, joka kertoo, montako lukua listasta tulee vähintään poistaa, jotta lopullisessa listassa on sama luku alussa ja lopussa. Joka askeleella saat poistaa yhden luvun listan alusta tai lopusta. Funktion tulee toimia tehokkaasti suurillakin listoilla.

Esimerkiksi jos lista on `[1, 2, 3, 4, 3, 6]`, haluttu tulos on 3, koska voit poistaa kaksi lukua listan alusta ja yhden luvun listan lopusta, jolloin lopullinen lista on `[3, 4, 3]`. Tämä on pienin mahdollinen määrä poistettavia lukuja.

**Malliratkaisu**

```python
def min_removals(numbers):
    n = len(numbers)
    first_pos = {}
    result = 1
    for i in range(n):
        number = numbers[i]
        if number in first_pos:
            result = max(result, i - first_pos[number] + 1)
        else:
            first_pos[number] = i
    return n - result
```

## Tehtävä 5

Tehtävä 5 on vaikeampi teoreettinen tehtävä. Sinun tulee ratkaista tämä tehtävä, jos haluat kurssista arvosanan 5. Tehtävä ei vaikuta muihin arvosanoihin.

**Esimerkkitehtävä**

Funktio $$f(n)$$ kuuluu luokkaan $$O(g(n))$$, jos voidaan valita positiiviset vakiot $$c$$ ja $$n_0$$ niin, että $$f(n) \le c g(n)$$, kun $$n \ge n_0$$.

Todista tämän määritelmän perusteella, että $$f(n)=n^2$$ ei kuulu luokkaan $$O(n)$$.

**Malliratkaisu**

Tehdään vastaoletus, että $$f(n)=n^2$$ kuuluu luokkaan $$O(n)$$. Tällöin $$n^2 \le cn$$ jollain vakiolla $$c$$, kun $$n \ge n_0$$. Tämä tarkoittaisi, että $$n \le c$$, mikä ei ole kuitenkaan mahdollista, koska $$n$$ voi kasvaa rajatta ja $$c$$ on vakio. Vastaoletus ei päde ja väite on todistettu.
