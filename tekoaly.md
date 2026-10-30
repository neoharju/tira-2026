---
title: Tekoälyn käyttöä Tirassa (osa 1)
permalink: /tekoaly/
hide: true
---

# Tekoälyn käyttöä Tirassa (osa 1)

Kurssin säännöissä on selkeästi kielletty tehtävien ratkominen tekoälyn avulla, mutta ei tietenkään kannata ajatella, että tämän seurauksena kukaan kurssin osallistuja ei ratkoisi tehtäviä tekoälyllä.

Tämän ilmiön kannalta kiinnostava on kurssin viikon 4 tehtävä [Pariton](https://cses.fi/tira26k/task/3679). Tehtävässä annettuna on lista, jossa tarkalleen yhtä lukua on pariton määrä, ja listasta tulee etsiä tämä luku. Tarkoitettu tapa ratkoa tehtävä on esimerkiksi käydä lista läpi ja laskea sanakirjan avulla kunkin luvun esiintymismäärä:

```python
def find_number(numbers):
    count = {}
    for x in numbers:
        if x not in count:
            count[x] = 0
        count[x] += 1

    for x in count:
        if count[x] % 2 == 1:
            return x
```

Jos tehtävänannon syöttää tekoälylle, tuloksena on usein hyvin toisenlainen ratkaisu, joka perustuu xor-summan laskemiseen:

```python
def find_number(numbers):
    xor_sum = 0
    for x in numbers:
        xor_sum ^= x
    return xor_sum
```

Tämä ratkaisu toimii, koska xor-summassa kaikki parillisen määrän kertoja esiintyvät luvut kumoavat toisensa ja jäljelle jää vain parittoman määrän kertoja esiintyvä luku. Tämä on hieno ratkaisu – mutta olisi hyvin yllättävää, että Tiraa suorittava opiskelija päätyisi tällaiseen ratkaisuun itsenäisesti.

Kurssilla tehtävän ratkaisi yhteensä 163 opiskelijaa, joista 14 opiskelijaa palautti tehtävään xor-ratkaisun. Kurssin vastuuhenkilölle xor-ratkaisun palauttaminen on merkki siitä, että opiskelija teettää kurssin tehtävät suoraan tekoälyllä. Mutta miten nämä opiskelijat menestyivät kurssilla loppujen lopuksi?

Tässä ovat xor-ratkaisijoiden tulokset kurssilla:

* 1 opiskelija keskeytti kurssin viikolla 6.
* 8 opiskelijaa ratkoi tehtäviä riittävästi kurssin läpäisyä varten, mutta ei läpäissyt kurssin tenttiä.
* 5 opiskelijaa ratkoi riittävästi tehtäviä _ja_ läpäisi kurssin tentin. Arvosanajakauma: 1 kpl arvosana 1, 3 kpl arvosana 3 ja 1 kpl arvosana 5.

Siis xor-ratkaisijoista 5/14 opiskelijaa pääsi läpi kurssin tentistä ja yksi sai kurssista jopa korkeimman arvosanan 5.

Jos oletetaan, että xor-ratkaisijat ratkoivat järjestelmällisesti kurssin tehtävät tekoälyllä, tämä tuo esille ongelman: tentistä huolimatta kolmannes näistä opiskelijoista läpäisi kurssin. Tämä huoli on tuotu esille myös Jodelissa @tko-äly-kanavalla Tiran tentin vaikeuteen liittyvässä keskustelussa. Anonyymin keskustelijan mukaan "liian helppoja on. Voit surutta promptaa tehtävät ja pääset silti läpi." Vaikuttaa, että näin voi todella tapahtua ja jopa arvosanalla 5.

Kuitenkin xor-ratkaisijoiden osuus kurssin suorittajista oli pieni. Kurssin suoritti yhteensä 99 opiskelijaa ja näistä 5 opiskelijaa palautti xor-ratkaisun, joten vain noin 5 % kurssin suorittajista palautti xor-ratkaisun. Toisaalta xor-ratkaisut eivät anna kattavaa kuvaa siitä, moniko kurssin suorittaja käyttää tekoälyä. Vaikka tekoäly tuottaa tehtävään usein xor-ratkaisun, se saattaa tuottaa myös toisenlaisen ratkaisun, josta ei huomaa mitään erityistä. Lisäksi xor-ratkaisun palauttaminen ei tarkoita, että opiskelija varmasti ratkoi suuren osan kurssin tehtävistä tekoälyllä.

Kurssin suorittaminen arvosanalla 5 vaati, että opiskelija ratkaisi tentissä kaikki tehtävät riittävän hyvin. Tämä voi tarkoittaa joko sitä, että tekoälyn käyttämisestä huolimatta opiskelija oli oppinut kurssin asiat tai sitten tentti ei onnistunut mittaamaan hyvin kurssin asioiden hallintaa. Jos opiskelija oli todella oppinut kurssin asiat ratkomalla tehtävät tekoälyllä, voi miettiä, haittaako tekoälyn käyttäminen oikeastaan silloin, jos se johtaa tähän tulokseen?

Kurssin vastuuhenkilölle näyttää varsin selvältä, että xor-ratkaisun palauttaneet opiskelijat toimivat kurssin sääntöjen vastaisesti. Miksi tätä asiaa ei aleta tutkia vilppinä [yliopiston ohjeiden](https://studies.helsinki.fi/ohjeet/artikkeli/mita-ovat-vilppi-ja-plagiointi) mukaisesti? Syynä on, että vaikka xor-ratkaisu _näyttää_ tekoälyn tuottamalta, tätä ei ole mahdollista todistaa luotettavasti. On mahdollista, että kurssilla on opiskelija, joka on keksinyt xor-ratkaisun itse tai esimerkiksi oppinut sen joskus aiemmin. Luultavasti joukko tekoälyä käyttäneitä opiskelijoita sai nyt suorituksen, mutta tämä on pienempi ongelma, kuin että joku opiskelija tuomittaisiin tekoälyn käyttäjäksi syyttömänä.
