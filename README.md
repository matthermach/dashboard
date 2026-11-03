# FlowLens — dashboard czasów realizacji

Publiczna strona: https://matthermach.github.io/dashboard/

Ciemny, responsywny dashboard na podstawie `Lead Times - 2024-25.xlsx`.
Scatterplot rozróżnia kolorem S, M i L. Filtry można łączyć. Kliknięcie punktu
lub przycisku w tabeli wyklucza go z prognozy; ponowne kliknięcie przywraca.
Nie ma automatycznego usuwania outlierów.

Filtr **Data ukończenia** pozwala podać datę „Od”, „Do” lub obie i wybrać
**Zastosuj**. Granice są włączone do zakresu, a puste pole oznacza brak granicy.
Filtr działa razem z rozmiarami i wykluczeniami na wykres, prognozy oraz tabelę.
Odwrócony zakres jest odrzucany z komunikatem bez zmiany poprzedniej analizy.
**Wyczyść daty** usuwa tylko zakres dat; nie zmienia rozmiarów ani wykluczeń.
Zakres dat nie jest zapisywany po odświeżeniu ani w kopii JSON.
Eksport zawsze zawiera wszystkie punkty, również poza filtrami. Nowy punkt
spoza wybranego okresu jest zapisywany, ale nie jest widoczny do zmiany filtra.

P50, P85 i P95 są liczone dla aktywnych rozmiarów, dat i niewykluczonych punktów,
metodą interpolacji liniowej zgodną z Excel `PERCENTILE.INC`.
To percentyle historycznej próby, nie gwarancje terminu. Jednostka: dni.

## Tempo dostarczania — XMR

Zakładka **Tempo dostarczania · XMR** w `index.html` korzysta z osobnego pliku
`Throughput Daily.xlsx` (kolumny `Data (DD/MM/YYYY)` i `Przepustowość`).
Konwerter publikuje dzienne dane jako `throughput.json`; błędne daty,
duplikaty dni oraz ujemne, ułamkowe lub nieliczbowe wartości blokują publikację.
Nie są wymagane biblioteki do Excela ani wykresów.

Sumy tygodniowe X są liczone od **7 stycznia roku pierwszej daty w arkuszu**:
7–13 stycznia, 14–20 stycznia itd., bez resetowania na granicy roku.
Obecny arkusz rozpoczyna się 7 stycznia 2025 r. Dni wcześniejsze niż początek
analizy są pomijane. Sumujemy wartości przepustowości, nie liczbę rekordów.
MR to bezwzględna różnica dwóch kolejnych sum X; pierwszy okres nie ma MR.
Korytarz X: **max(0, średnia X − 2,66 × średni MR)** do
**średnia X + 2,66 × średni MR**.
Korytarz MR: **max(0, średni MR − 3,27 × średni MR)** do
**średni MR + 3,27 × średni MR** (nie jest to standardowa granica D3/D4).
Przy jednym tygodniu MR, korytarze i sygnały nie są wyznaczane.

Oba wykresy wykrywają cztery sygnały: **czerwony** punkt poza korytarzem
(zjawisko o przypisywalnej przyczynie), **pomarańczowe** 2 z 3 kolejnych
wartości poza 2σ (umiarkowany sygnał), **żółte** 3 z 5 poza 1σ (umiarkowany
sygnał) oraz **białą** serię 8 punktów po jednej stronie średniej (niewielka
trwała zmiana). Dla reguł 2 z 3 i 3 z 5 przekroczenia muszą leżeć po tej
samej stronie średniej. Wymagamy pełnego okna kolejnych wartości; brak MR
przerywa okno. Równość z linią nie jest przekroczeniem, a równość ze średnią
przerywa serię. Oznaczamy wszystkie punkty spełniające warunek w danym oknie;
przy serii 8 punktów całą serię, także gdy jest dłuższa niż 8.

Sigma to 1/3 nieobciętej połowy szerokości korytarza:
**σ X = 2,66 × średni MR / 3**, **σ MR = 3,27 × średni MR / 3**.
Obcięcie dolnych granic do zera nie zmienia sigmy. Linie 1σ są żółte,
2σ pomarańczowe, korytarz czerwony, a średnia zielona. Przy nakładaniu się
sygnałów kolor punktu ma priorytet: czerwony, pomarańczowy, żółty, biały.
Opis punktu i tabela pokazują wszystkie sygnały, bez utraty tych o niższym
priorytecie. Podsumowania liczą oznaczone punkty (nie okna).

Ostatni okres oraz inne tygodnie z mniej niż 7 dniami danych są oznaczane jako
niepełne w tabeli, ostrzeżeniu i pustymi punktami na wykresie. Są uwzględniane
w średnich, granicach i sygnałach; brakujących dni nie ekstrapolujemy.
Tabela udostępnia dokładne sumy, MR oraz sygnały obu wykresów.
Ta zakładka nie korzysta z filtrów, lokalnych dodatków ani wykluczeń analizy
czasów realizacji. Zakładki obsługują klawiaturę oraz adres `#throughput`.

## Roadmapa — wiele zespołów i Monte Carlo

Nowa zakładka **Roadmapa · Monte Carlo** (`#roadmap`) umożliwia dodawanie,
edycję i usuwanie kompetencji, nazwanych zespołów oraz co najmniej dwóch
inicjatyw. Checkboxy przypisują kompetencje zespołom i zespoły inicjatywom.
Kalendarz obejmuje 12 miesięcy od wybranego miesiąca (domyślnie bieżącego).
Capacity to dostępne **osobodni zespołu dla kompetencji w miesiącu**;
brak wpisanej capacity oznacza 0. Zmiana początku kalendarza zachowuje
wcześniejsze wpisy, ale prognoza korzysta tylko z widocznych 12 miesięcy.

Każdy element inicjatywy ma nazwę, zespół, kompetencję, estymaty min/max
w osobodniach, opcjonalny najwcześniejszy start i opcjonalny **fixed date**.
Inicjatywa również ma start i opcjonalny fixed date. Pracę wymagającą kilku
zespołów/kompetencji rozbij na osobne elementy. Strzałki zmieniają priorytet:
najpierw kolejność inicjatyw, potem kolejność ich elementów. Usunięcie zespołu,
kompetencji lub przypisania usuwa powiązane elementy po potwierdzeniu.

Model wykonuje 2 000 powtarzalnych symulacji, niezależnie losując wysiłek
z rozkładu jednostajnego min–max. Miesięczna capacity jest równomiernie
rozłożona na poniedziałki–piątki; święta i urlopy należy odjąć samodzielnie.
Wspólne pule zespół–kompetencja są rezerwowane tylko raz, zgodnie z priorytetem.
Różne pule działają równolegle; model nie zakłada zależności finish-to-start.
Nie licz tej samej osoby w kilku pulach kompetencji. Elementy o późniejszym
starcie nie zabierają capacity przed swoją datą startu.

**P85** to najwcześniejsza data z ukończeniem w co najmniej 85% symulacji
(percentyl najbliższej rangi). Nieukończone próby pozostają w mianowniku.
Dla inicjatywy najpierw wyznaczamy koniec wszystkich elementów w każdej
symulacji, potem percentyl. Gantt pokazuje start P50 → koniec P85 i termin
fixed date, a opisy wierszy udostępniają P50, P85, szansę ukończenia w roku
i szansę dotrzymania terminu. Fixed date nie wymusza ukończenia ani nie dodaje
capacity; wynik poniżej 85% jest ostrzeżeniem. Brak capacity i przekroczenie
kalendarza dają wynik „Poza horyzontem”, nie wymyśloną datę.

Plan zapisuje się pod osobnym kluczem `flowlens-roadmap-v1` w `localStorage`.
Eksport/import JSON jest niezależny od danych przepływu, a import zastępuje
plan po potwierdzeniu. Uszkodzony zapis nie jest automatycznie nadpisywany.
Każda zmiana unieważnia wynik; ponownie wybierz **Oblicz prognozę P85**.
Limity: 30 kompetencji, 50 zespołów, 50 inicjatyw, 100 elementów łącznie.
Prognoza zależy od założeń, nie jest gwarancją daty.

## Dane przepływu i zapis

Formularz dodaje rozmiar, dodatni czas realizacji w dniach oraz datę ukończenia.
Nowe punkty i wykluczenia zapisują się w `localStorage` przeglądarki pod kluczem
`flowlens-dashboard-v1`. Nie zmieniają XLSX ani danych innych użytkowników.
Eksport JSON obejmuje pełną kopię danych i wykluczeń; import zastępuje ją po
potwierdzeniu. Przed czyszczeniem pamięci przeglądarki wykonaj eksport.
Uszkodzona lokalna kopia nie jest automatycznie nadpisywana.

Dane XLSX są konwertowane na `data.json` podczas publikacji. Kolumny pierwszego
arkusza: `Data ukończenia`, `Deklarowany rozmiar`, `Czas realizacji`.
Obsługiwane daty: polskie nazwy miesięcy (np. `15 Lipca 2024`), ISO `YYYY-MM-DD`
lub numery seryjne dat Excela (system 1900). Czas musi być dodatnią liczbą.
Nieprawidłowy wiersz blokuje publikację zamiast być po cichu pomijany.
Zmiana pliku XLSX i push na `main` automatycznie publikuje stronę.

Lokalna kopia zachowuje dotychczasowe dane; nowe rekordy XLSX są dołączane na
podstawie stabilnego identyfikatora treści. Zmieniony wiersz XLSX jest nowym
rekordem, a stary pozostaje w lokalnej kopii. Aby przejść wyłącznie na aktualny
arkusz, najpierw wyeksportuj kopię, a następnie usuń wskazany klucz `localStorage`.
Duplikaty wierszy w arkuszu są zachowane jako osobne obserwacje.

## Uruchomienie lokalne

Wymagania: Python 3.10+ i Node.js 18+ do testów. Brak zależności pakietowych.

```sh
python3 scripts/convert_xlsx.py
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m http.server 8000
```

Otwórz http://localhost:8000. Nie otwieraj bezpośrednio pliku HTML przez `file://`.
GitHub Pages publikuje workflow `.github/workflows/pages.yml`; w ustawieniach
repozytorium źródłem Pages powinno być **GitHub Actions**.
Wykres, obliczenia i dane nie wymagają zewnętrznych bibliotek ani usług.
Krój pisma jest pobierany z Google Fonts, z systemowym fontem zastępczym.

Publikacja uruchamia `python3 scripts/build_site.py`, który tworzy `_site/`.
Moduły źródłowe `.mjs` są publikowane jako `.js`, aby serwer podawał typ MIME
obsługiwany przez przeglądarki. Nazwy skryptów i CSS zawierają skrót zawartości;
zmiana modułu bazowego zmienia też adres skryptu aplikacji. Dzięki temu nowy
HTML nie korzysta ze starszych skryptów z pamięci podręcznej przeglądarki.
Aby odtworzyć publikację lokalnie, uruchom konwersję, budowanie i
`python3 -m http.server 8000 --directory _site`.
