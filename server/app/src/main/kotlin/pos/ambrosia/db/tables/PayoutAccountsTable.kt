package pos.ambrosia.db.tables

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.dao.java.UUIDEntity
import org.jetbrains.exposed.v1.dao.java.UUIDEntityClass
import pos.ambrosia.db.SQLiteUUIDTable
import java.util.UUID

object PayoutAccountsTable : SQLiteUUIDTable("payout_accounts") {
    val type = varchar("type", 20)
    val accountHolder = varchar("account_holder", 255).nullable()
    val bankName = varchar("bank_name", 255).nullable()
    val accountNumber = varchar("account_number", 255).nullable()
    val currencyId = optReference("currency_id", CurrencyTable)
    val swift = varchar("swift", 50).nullable()
    val iban = varchar("iban", 50).nullable()
    val clabe = varchar("clabe", 50).nullable()
    val lightningAddress = varchar("lightning_address", 255).nullable()
    val isDeleted = bool("is_deleted").default(false)
    val createdAt = varchar("created_at", 50)
}

class PayoutAccountEntity(
    id: EntityID<UUID>,
) : UUIDEntity(id) {
    companion object : UUIDEntityClass<PayoutAccountEntity>(PayoutAccountsTable)

    var type by PayoutAccountsTable.type
    var accountHolder by PayoutAccountsTable.accountHolder
    var bankName by PayoutAccountsTable.bankName
    var accountNumber by PayoutAccountsTable.accountNumber
    var currencyId by PayoutAccountsTable.currencyId
    var swift by PayoutAccountsTable.swift
    var iban by PayoutAccountsTable.iban
    var clabe by PayoutAccountsTable.clabe
    var lightningAddress by PayoutAccountsTable.lightningAddress
    var isDeleted by PayoutAccountsTable.isDeleted
    var createdAt by PayoutAccountsTable.createdAt
}
