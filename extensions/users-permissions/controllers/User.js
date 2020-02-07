const { sanitizeEntity } = require('strapi-utils');

const sanitizeUser = user =>
  sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

module.exports = {
    async findOne(ctx) {
      if (!ctx.state.user) {
        return ctx.badRequest(null, [
          { messages: [{ id: 'No authorization header was found' }] },
        ]);
      }
        const { id } = ctx.params;
        let data = await strapi.plugins['users-permissions'].services.user.fetch({
          id,
        });
    
        if (data) {
          data = sanitizeUser(data);
        }

        data.videos = data.videos
            .filter(v => v.hasOwnProperty('id'))
            .map(v => ({ ...v, thumbnail: `/uploads/${v.name.split('.')[0]}.png`}))

        // Send 200 `ok`
        ctx.send(data);
    }
}