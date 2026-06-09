// Value Object
class Money {
  final int cents;
  final String currency;

  const Money({required this.cents, required this.currency})
      : assert(cents >= 0, 'Price cannot be negative');
}

// Entity
class Product {
  final String id;
  final String name;
  final String slug;
  final String description;
  final Money price;
  final bool isActive;

  Product({
    required this.id,
    required this.name,
    required this.slug,
    required this.description,
    required this.price,
    required this.isActive,
  });

  // Invariants checking
  void validate() {
    if (name.isEmpty) throw ArgumentError('Product name cannot be empty');
    if (slug.isEmpty) throw ArgumentError('Product slug cannot be empty');
  }
}
