var moment = require('moment'),
    config = require('config');

    // libs
    log = require('libs/LoggingObject'),
    database = require('libs/DatabaseClass'),
    storage = require('libs/StorageClass'),

    // sync api
    SyncApi = require('api/api');

//
// App Character Class
//
class AppCharacterClass
{
    constructor()
    {
        this.Events = require('app/app-character-events');
        this.Tracking = require('app/app-character-tracking');
        this.Pets = require('app/app-character-pets');
        this.GrandCompany = require('app/app-character-gc');
        this.Gear = require('app/app-character-gear');
        this.Role = require('app/app-character-roles');
    }

    //
    // Get a character via a specific id
    //
    get(id, callback)
    {
        database.QueryBuilder
            .select()
            .columns('*')
            .from('characters')
            .where('lodestone_id = ?')
            .limit(0,1);

        database.noCache().sql(database.QueryBuilder.get(), [id], callback);
        return this;
    }

    //
    // Get the last pending characters
    //
    getLastPending(start, callback)
    {
        database.QueryBuilder
            .select()
            .columns('*')
            .from('pending_characters')
            .where(['lodestone_id != 0', 'processed IS NULL', 'deleted = 0'])
            .order('added', 'asc')
            .limit((start) ? start : 0,config.settings.autoAddCharacters.limitPerCycle)

        database.sql(database.noCache().QueryBuilder.get(), [], callback);
        return this;
    }

    //
    // Get the last updated characters
    //
    getLastUpdated(start, callback)
    {
        database.QueryBuilder
            .select()
            .columns('*')
            .from('characters')
            .order('last_updated', 'asc')
            .limit((start) ? start : 0, config.settings.autoUpdateCharacters.limitPerCycle);

        database.sql(database.noCache().QueryBuilder.get(), [], callback);
        return this;
    }

    //
    // Get a character from lodestone
    //
    getFromLodestone(lodestoneId, callback)
    {
        log.echo('Requesting {id:cyan} from lodestone', {
            id: lodestoneId,
        });

        SyncApi.getCharacter(null, { id: lodestoneId }, callback);
        return this;
    }

    //
    // Add a character to the pending table
    //
    addToPending(idList)
    {
        if (!config.persistent || !idList) {
            return;
        }

        // create query
        database.QueryBuilder
            .insert('pending_characters')
            .insertColumns(['lodestone_id'])
            .insertData(idList)
            .duplicate(['lodestone_id']);

        // run query
        database.sql(database.QueryBuilder.get());
        return this;
    }

    //
    // Add character to the database
    //
    addCharacter(data, callback, isUpdate)
    {
        var characterId = data.id;

        // insert columns
        var insertColumns = ['last_updated', 'lodestone_id', 'name', 'server', 'avatar', 'portrait', 'data'],
            insertData = [moment().format('YYYY-MM-DD HH:mm:ss'), '?', '?', '?', '?', '?', '?'];

        // bind data
        var binds = [
            characterId,
            data.name,
            data.server,
            data.avatar,
            data.portrait,
        ];

        // stringify json
        var json = JSON.stringify(data);

        // compress data
        storage.compress(json, (json) => {
            // add json
            binds.push(json);

            // insert character
            database.QueryBuilder
                .insert('characters')
                .insertColumns(insertColumns)
                .insertData([insertData])
                .duplicate(['last_updated', 'lodestone_id', 'name', 'server', 'avatar', 'portrait', 'data']);

            // run query
            database.sql(database.QueryBuilder.get(), binds, (data) => {
                // update characters pending table date
                // - this is only done if we're not updating a character
                if (!isUpdate) {
                    database.QueryBuilder
                        .update('pending_characters')
                        .set({ processed: moment().format('YYYY-MM-DD HH:mm:ss') })
                        .where('lodestone_id = ?');

                    // run query
                    database.sql(database.QueryBuilder.get(), [ characterId ], callback);
                } else {
                    callback(data);
                }
            });
        });

        return this;
    }

    //
    // Update a character
    // - This is an alias to addCharacter since the
    //   code would be the same.
    //
    updateCharacter(data, callback)
    {
        this.addCharacter(data, callback, true);
    }

    //
    // Set a character as deleted
    //
    setDeleted(lodestoneId)
    {
        log.echo('Marking character {id:red} as deleted.', {
            id: lodestoneId,
        });

        database.QueryBuilder
            .update('pending_characters')
            .set({
                processed: moment().format('YYYY-MM-DD HH:mm:ss'),
                deleted: 1
            })
            .where('lodestone_id = ?');

        // run query
        database.sql(database.QueryBuilder.get(), [ lodestoneId ]);
    }
}

// Export it
module.exports = new AppCharacterClass();
