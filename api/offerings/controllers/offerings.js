'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/3.0.0-beta.x/concepts/controllers.html#core-controllers)
 * to customize this controller
 */

module.exports = {
    following: async (ctx) => {
        const currentUser = await strapi.plugins['users-permissions'].services.user.fetch({ id: 11 })
        const followedUser = await Promise.all(currentUser.following.map(u => {
            return strapi.plugins['users-permissions'].services.user.fetch({ id: u.id })
        }))

        const offeringsFromFollowedUsers = (followedUser.map(u => u.offerings)).reduce((acc, val) => acc.concat(val), []);

        const currentNotifications = await strapi.services.notifications.find({ user: currentUser.id })
        const nonSavedNotifications = offeringsFromFollowedUsers.map(offering => {
            const notification = currentNotifications.find(CN => offering.id === CN.offering.id)

            if (!notification) {
                return strapi.services.notifications.create({ user: currentUser.id, offering, wasRead: false })
            }

            return null;

        }).filter(n => n !== null);

        await Promise.all(nonSavedNotifications)
        const nonReadNotifications = (await strapi.services.notifications.find({ user: currentUser.id }))
            .map(n => {
                delete n.user;
                return n;
            })


        ctx.send(nonReadNotifications);
    }
};
