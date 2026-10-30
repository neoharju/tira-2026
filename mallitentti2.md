---
title: Mallitentti (II-osa)
permalink: /mallitentti2/
hide: true
---

# Mallitentti (II-osa)

Seuraava mallitentti antaa näytteen siitä, millainen on kurssin II-osan tentti.

Tentti muodostuu viidestä tehtävästä, jotka ovat samantapaisia kuin mallitentissä. Kurssin suoritus vaatii, että ratkaiset ainakin kolme ensimmäistä tehtävää. Kaksi viimeistä tehtävää liittyy arvosanoihin 4 ja 5.

## Tehtävä 1

Tehtävässä 1 sinun tulee kertoa, minkä tuloksen tietty kurssilla käsitelty verkkoalgoritmi tuottaa annetulle verkolle. Sinun tulee ratkaista tämä tehtävä, jotta pääset kurssin läpi.

**Esimerkkitehtävä**

Minkä tuloksen Dijkstran algoritmi antaa seuraavalle verkolle, kun aloitussolmu on solmu 1?

{% include viz.html id="weighted" alt="Painotettu suunnattu verkko viidellä solmulla." fallback="img/lyhpol.png" %}

**Malliratkaisu**

Dijkstran algoritmi laskee lyhimmän etäisyyden aloitussolmusta kuhunkin solmuun. Tässä tapauksessa algoritmi antaa seuraavat etäisyydet:

- Solmu 1: 0
- Solmu 2: 4
- Solmu 3: 1
- Solmu 4: 3
- Solmu 5: 6

## Tehtävä 2

Tehtävässä 2 sinun tulee antaa esimerkki verkosta, jolla on tiettyjä ominaisuuksia. Sinun tulee ratkaista tämä tehtävä, jotta pääset kurssin läpi.

**Esimerkkitehtävä**

Anna esimerkki verkosta, jossa on viisi solmua ja kolme vahvasti yhtenäistä komponenttia. Ilmoita jokaisesta komponentista, mitkä solmut kuuluvat siihen.

**Malliratkaisu**

Tässä on halutunlainen verkko:

{% include viz.html id="digraph" mode="scc" alt="Suunnattu verkko, jossa on viisi solmua ja kolme vahvasti yhtenäistä komponenttia." fallback="img/suuver.png" %}

Vahvasti yhtenäiset komponentit ovat $$\{1,2,4\}$$, $$\{3\}$$ ja $$\{5\}$$.

## Tehtävä 3

Tehtävässä 3 sinun tulee näyttää, miksi annettu ahne algoritmi ei ole toimiva. Sinun tulee ratkaista tämä tehtävä, jotta pääset kurssin läpi.

**Esimerkkitehtävä**

Tehtävänä on muodostaa listan pisin nouseva alijono eli kerätä listalta mahdollisimman monta alkiota vasemmalta oikealle kulkien niin, että jokainen alkio on edellistä suurempi.

Ahne algoritmi: valitaan ensin listan pienin alkio, sitten pienin edellistä suurempi alkio tämän oikealla puolella, jne. Esimerkiksi listassa $$[5,1,3,2,4]$$ algoritmi valitsee ensin alkion $$1$$, sitten alkion $$2$$ ja lopuksi alkion $$4$$, jolloin tulee pisin nouseva alijono $$[1,2,4]$$.

Näytä esimerkki listasta, jossa tämä ahne algoritmi ei toimi oikein. Minkä tuloksen algoritmi antaa ja miksi se on väärin?

**Malliratkaisu**

Ahne algoritmi ei toimi oikein esimerkiksi listassa $$[2,3,1]$$. Tässä listassa algoritmi muodostaa alijonon $$[1]$$ mutta pisin nouseva alijono on $$[2,3]$$.

## Tehtävä 4

Tehtävän 4 aiheena on rekursio. Sinun tulee ratkaista tämä tehtävä, jos haluat kurssista arvosanan 4 tai 5. Tehtävä ei vaikuta muihin arvosanoihin.

**Esimerkkitehtävä**

Tarkastellaan seuraavaa funktiota:

```python
def f(n):
    result = 1
    if n % 2 == 0:
        result += f(n // 2)
    if n % 3 == 0:
        result += f(n // 3)
    return result
```

Minkä arvon palauttaa funktiokutsu `f(6)`?

**Malliratkaisu**

Lasketaan funktion arvot:

* `f(1) = 1`
* `f(2) = 1 + f(1) = 2`
* `f(3) = 1 + f(1) = 2`
* `f(4) = 1 + f(2) = 3`
* `f(5) = 1`
* `f(6) = 1 + f(3) + f(2) = 5`

Siis funktiokutsu `f(6)` palauttaa arvon `5`.

## Tehtävä 5

Tehtävä 5 on vaikeampi teoreettinen tehtävä. Sinun tulee ratkaista tämä tehtävä, jos haluat kurssista arvosanan 5. Tehtävä ei vaikuta muihin arvosanoihin.

**Esimerkkitehtävä**

Verkon jokaisella kaarella on eri paino. Todista, että pienimmässä virittävässä puussa on varmasti kaari, jonka paino on pienin.

**Malliratkaisu**

Oletetaan, että painoltaan pienin kaari $$e$$ on solmujen $$x$$ ja $$y$$ välillä.

Oletetaan, että on muodostettu virittävä puu, jossa ei ole kaarta $$e$$. Tässä puussa täytyy olla jokin polku solmusta $$x$$ solmuun $$y$$. Kun jokin tämän polun kaarista korvataan kaarella $$e$$, saadaan toinen virittävä puu, jonka paino on aiempaa pienempi. Niinpä alkuperäinen virittävä puu ei ollut pienin virittävä puu ja väite on todistettu.
