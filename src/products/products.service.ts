import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
  ) {}

  async findAll(): Promise<Product[]> {
    // Solo productos activos
    return this.productsRepository.find({ 
      where: { isActive: true } 
    });
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepository.findOne({ 
      where: { id, isActive: true } 
    });
    if (!product) {
      throw new NotFoundException(`Product #${id} not found`);
    }
    return product;
  }

  async findAvailable(): Promise<Product[]> {
    return this.productsRepository.find({ 
      where: { 
        isAvailable: true,
        isActive: true 
      } 
    });
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    // Verificar si el nombre del producto ya existe
    const existingProduct = await this.productsRepository.findOne({
      where: { name: createProductDto.name }
    });
    
    if (existingProduct) {
      throw new ConflictException('Product name already exists');
    }

    // Validar precio positivo
    if (createProductDto.price <= 0) {
      throw new BadRequestException('Price must be greater than 0');
    }

    // Validar stock no negativo
    if (createProductDto.stock < 0) {
      throw new BadRequestException('Stock cannot be negative');
    }

    const product = this.productsRepository.create(createProductDto);
    return this.productsRepository.save(product);
  }

  async updateStock(id: number, quantity: number): Promise<Product> {
    // Validar cantidad
    if (quantity < 0) {
      throw new BadRequestException('Stock cannot be negative');
    }

    const product = await this.findOne(id);
    product.stock = quantity;
    
    // Actualizar disponibilidad automáticamente
    product.isAvailable = quantity > 0;
    
    return this.productsRepository.save(product);
  }

  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);

    product.isAvailable = false; // marcarlo como no disponible
    
    await this.productsRepository.save(product);
  }
}
