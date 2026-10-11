/**
 * Kasa/palet sayımına girebilecek ürünler (depo paneli ürün kimlikleri).
 * Elle düzenlemeyin; barkod listesi değişirse yeniden üretin:
 *   node --env-file=.env.local scripts/resolve-kasa-palet-products.mjs
 */

export type KasaPaletProduct = {
  barcode: string;
  productId: string;
  name: string;
  imageUrl: string | null;
};

export const KASA_PALET_PRODUCTS: readonly KasaPaletProduct[] = [
  {
    barcode: "3000000000000016",
    productId: "5f1540e1dec75b083d7fd7ab",
    name: "Ak Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/3cb721ae-ca34-41c9-9a61-984421cc9247.jpg",
  },
  {
    barcode: "3000000000000006",
    productId: "61ba2699449dd93b37fdb12f",
    name: "Akkurt Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/646bee1a-573c-42ff-8d8e-e4088b5fa231.jpg",
  },
  {
    barcode: "3000000000000013",
    productId: "5f15417f5bf7ad1d9a6619f4",
    name: "Balkan Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/e5156bc1-5c44-4410-bf25-4f9fba10d04d.jpg",
  },
  {
    barcode: "3000000000000030",
    productId: "662f8971a56520dd1a12cf60",
    name: "Büyük Küfe",
    imageUrl: "https://cdn-image.getir.com/market/product/b1bfec56-3728-41df-abed-238f6fa6332f.jpg",
  },
  {
    barcode: "3000000000000011",
    productId: "61b8a7aa6804264c1bba955a",
    name: "Chep Palet",
    imageUrl: "https://cdn-image.getir.com/market/product/2e854ec7-5e02-47ed-b011-bdccc7e958c8.jpg",
  },
  {
    barcode: "3000000000000005",
    productId: "61b8a867833f273bc9365e75",
    name: "Coca-Cola Palet",
    imageUrl: "https://cdn.getir.com/misc/product_placeholder_getir_logo.jpeg",
  },
  {
    barcode: "3000000000000008",
    productId: "61b8a988143a0420dfc4e811",
    name: "Eker Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/8b2b6c19-281a-40c3-bc7f-86f7c502a82a.jpg",
  },
  {
    barcode: "3000000000000015",
    productId: "5c2df6686c8c720001c43b57",
    name: "Euro Palet",
    imageUrl: "https://cdn-image.getir.com/market/product/167917b5-7a75-4bee-a047-adf5232fb52b.jpg",
  },
  {
    barcode: "3000000000000023",
    productId: "65bcaf161acd46d97d45af14",
    name: "Halk Ekmek Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/cf548302-6294-49d4-bcd4-a5159d657d32.jpg",
  },
  {
    barcode: "3000000000000024",
    productId: "668b97d95ced5ece49584682",
    name: "IFKO Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/67abdea7-dac0-44a2-acb0-b79bffbe1fba.jpg",
  },
  {
    barcode: "3000000000000017",
    productId: "619f5e5fdb26103a20c99fcf",
    name: "İçim Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/3a14f056-2cf6-4708-a33f-339cb498925a.jpg",
  },
  {
    barcode: "3000000000000029",
    productId: "690458a29b7f2782b8b572e1",
    name: "İtimat Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/117f6b7a-d33a-47d0-a3f9-b993abf3de82.jpg",
  },
  {
    barcode: "3000000000000028",
    productId: "68010e171b7806da892d2be2",
    name: "Kapaklı Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/34b88476-611c-4cd0-9d43-3667ceb930c2.jpg",
  },
  {
    barcode: "3000000000000002",
    productId: "62504c1ca7ef47256693dfb1",
    name: "Kuzeyden Euro Palet",
    imageUrl: "https://cdn-image.getir.com/market/product/77f2808a-af41-4a74-83e5-a146508db29a.jpg",
  },
  {
    barcode: "3000000000000034",
    productId: "6a34f839f2b9c040e758df6b",
    name: "Küçük Küfe (1 Adet)",
    imageUrl: "https://cdn-image.getir.com/market/product/fcd59d49-9519-428c-915e-4038b635a5c1.jpg",
  },
  {
    barcode: "3000000000000010",
    productId: "61b9effa708df25305a1fb0c",
    name: "Pepsi Palet",
    imageUrl: "https://cdn-image.getir.com/market/product/22c3005d-7b7a-4c5e-8183-8d1ff3253819.jpg",
  },
  {
    barcode: "3000000000000033",
    productId: "5f153affea9efb047c2682ac",
    name: "Pınar Kasa (Demirbaş)",
    imageUrl: "https://cdn-image.getir.com/market/product/92d99378-b11d-44de-95bb-734060c9588a.jpg",
  },
  {
    barcode: "3000000000000012",
    productId: "610a54a488c2324e0da19584",
    name: "Plastik Palet (Plastik Palet)",
    imageUrl: "https://cdn.getir.com/misc/product_placeholder_getir_logo.jpeg",
  },
  {
    barcode: "3000000000000009",
    productId: "61b8aa2b76f4b8106aa0274c",
    name: "Sek Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/afbfc5b3-efaa-4b1b-bb6d-deab6e5cfc5e.jpg",
  },
  {
    barcode: "3000000000000007",
    productId: "61b8a91ac321f28eab82ec43",
    name: "Sütaş Kasa - 30012",
    imageUrl: "https://cdn-image.getir.com/market/product/d78c3739-0236-46e8-ae2d-2d256440f71f.jpg",
  },
  {
    barcode: "3000000000000001",
    productId: "612ddf08310f6a74bfd434df",
    name: "Tahta Palet (Palet)",
    imageUrl: "https://cdn-image.getir.com/market/product/a4959f0e-4e3a-4faf-8015-b420e388c644.jpg",
  },
  {
    barcode: "3000000000000014",
    productId: "629da3f43f662e5464f62c75",
    name: "Tire Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/d471f94e-aeb0-44e0-8e7b-bb85a8fe7fb8.jpg",
  },
  {
    barcode: "3000000000000004",
    productId: "5d5d03953a58c400016e65f7",
    name: "Turpal Palet",
    imageUrl: "https://cdn-image.getir.com/market/product/8a289db7-9f6e-4d3f-82fd-87a661fc561b.jpg",
  },
  {
    barcode: "3000000000000003",
    productId: "5dafedcf80f35bc89049c613",
    name: "Uno Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/8e7fdb33-039f-4b4c-a244-7e852b8364c7.jpg",
  },
  {
    barcode: "3000000000000027",
    productId: "67f672e9473cf70d356a3ad1",
    name: "Untad Kasa",
    imageUrl: "https://cdn-image.getir.com/market/product/fef3cefb-4713-40d8-b64d-26637f30fd10.jpg",
  },
];
