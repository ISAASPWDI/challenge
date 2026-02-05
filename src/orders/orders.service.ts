/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UsersService } from '../users/users.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    private usersService: UsersService,
    private productsService: ProductsService,
  ) {}

  async findAll(): Promise<Order[]> {
    return this.ordersRepository.find({
      relations: ['user', 'items', 'items.product'],
    });
  }

  async findOne(id: number): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['user', 'items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException(`Order #${id} not found`);
    }

    return order;
  }

  async findByUser(userId: number): Promise<Order[]> {
    const user = await this.usersService.findOne(userId);

    return this.ordersRepository.find({
      where: { userId: user.id },
      relations: ['items', 'items.product'],
    });
  }

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    const user = await this.usersService.findOne(createOrderDto.userId);

    if (!user.isActive) {
      throw new BadRequestException('User is not active');
    }

    if (!createOrderDto.items || createOrderDto.items.length === 0) {
      throw new BadRequestException('Order must have at least one item');
    }

    const order = this.ordersRepository.create({
      userId: user.id,
      status: OrderStatus.PENDING,
      total: 0,
    });

    const savedOrder = await this.ordersRepository.save(order);

    let total = 0;

    for (const itemDto of createOrderDto.items) {
      if (itemDto.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than 0');
      }

      const product = await this.productsService.findOne(itemDto.productId);

      if (!product.isAvailable) {
        throw new BadRequestException(`Product ${product.name} is not available`);
      }

      if (product.stock < itemDto.quantity) {
        throw new BadRequestException(`Not enough stock for ${product.name}`);
      }

      const orderItem = this.orderItemsRepository.create({
        orderId: savedOrder.id,
        productId: product.id,
        quantity: itemDto.quantity,
        price: product.price,
      });

      await this.orderItemsRepository.save(orderItem);
      
      // codigo incorrecto: total = product.price * itemDto.quantity;

      // debe acumullar la suma de los productos
      total += product.price * itemDto.quantity;

      await this.productsService.updateStock(
        product.id,
        product.stock - itemDto.quantity,
      );
    }

    savedOrder.total = total;
    await this.ordersRepository.save(savedOrder);

    return this.findOne(savedOrder.id);
  }

  async updateStatus(id: number, status: OrderStatus): Promise<Order> {
    const order = await this.findOne(id);


    // validaciones extra paraa actualizar
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot update status of cancelled order');
    }

    if (
      order.status === OrderStatus.DELIVERED &&
      status !== OrderStatus.DELIVERED
    ) {
      throw new BadRequestException('Cannot change status of delivered order');
    }

    order.status = status;
    return this.ordersRepository.save(order);
  }

  async cancel(id: number): Promise<Order> {
    const order = await this.findOne(id);

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }

    for (const item of order.items) {
      const product = await this.productsService.findOne(item.productId);

      await this.productsService.updateStock(
        product.id,
        product.stock + item.quantity,
      );
    }

    order.status = OrderStatus.CANCELLED;
    return this.ordersRepository.save(order);
  }

  async remove(id: number): Promise<void> {
    const order = await this.findOne(id);

    if (order.status === OrderStatus.PENDING) {
      throw new BadRequestException('Cannot delete pending orders');
    }

    await this.ordersRepository.remove(order);
  }
}
